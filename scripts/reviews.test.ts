import './test-dom';

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement, type ReactElement } from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    Outlet,
    RouterProvider,
} from '@tanstack/react-router';

import { ReviewCard, ReviewsSection } from '../src/components/movies/ReviewsSection';
import { createLatestProfileRequestController, profileDialogFallback } from '../src/components/ProfileDialog';
import {
    authorizeReviewManagement,
    canManageReview,
    createReviewOperation,
    deleteReviewOperation,
    mapMovieReview,
    updateReviewOperation,
    validateReviewContent,
    type MovieReview,
    type ReviewContent,
} from '../src/server/reviews';
import { buildReviewNotification } from '../src/server/notifications';

test.afterEach(() => cleanup());

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

async function renderWithRouter(element: ReactElement) {
    const rootRoute = createRootRoute({ component: () => createElement(Outlet) });
    const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => element,
    });
    const signInRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/sign-in',
        component: () => null,
    });
    const router = createRouter({
        routeTree: rootRoute.addChildren([ indexRoute, signInRoute ]),
        history: createMemoryHistory({ initialEntries: [ '/' ] }),
    });
    await router.load();
    return render(createElement(RouterProvider, { router }));
}

function manageableReview(id = 'review-1'): MovieReview {
    return {
        id,
        title: 'Исходный заголовок',
        sentiment: 'NEUTRAL',
        text: 'Исходный текст',
        createdAt: '2026-08-20T10:00:00.000Z',
        updatedAt: '2026-08-20T10:00:00.000Z',
        edited: false,
        author: { id: 'author-1', name: 'Анна', avatarUrl: null },
        canManage: true,
    };
}

test('legacy comment row maps to a neutral review without a title and with author avatar', () => {
    const createdAt = new Date('2026-06-11T10:00:00.000Z');
    const review = mapMovieReview({
        id: 'review-1',
        title: null,
        sentiment: 'NEUTRAL',
        text: 'Исторический текст',
        createdAt,
        updatedAt: createdAt,
        user: {
            id: 'author-1',
            name: 'Анна',
            avatarUrl: 'https://example.com/anna.jpg',
        },
    }, { userId: 'viewer-1', role: 'USER' });

    assert.deepEqual(review, {
        id: 'review-1',
        title: null,
        sentiment: 'NEUTRAL',
        text: 'Исторический текст',
        createdAt: '2026-06-11T10:00:00.000Z',
        updatedAt: '2026-06-11T10:00:00.000Z',
        edited: false,
        author: {
            id: 'author-1',
            name: 'Анна',
            avatarUrl: 'https://example.com/anna.jpg',
        },
        canManage: false,
    });
});

test('review migration preserves legacy creation time as the initial update time', () => {
    const migration = readFileSync('prisma/migrations/20260820200000_movie_people_reviews/migration.sql', 'utf8');
    assert.match(migration, /UPDATE "Comment" SET "updatedAt" = "createdAt"/);
});

test('review validation enforces title, sentiment, and text boundaries with safe Russian errors', () => {
    assert.equal(validateReviewContent({
        title: 'a'.repeat(120),
        sentiment: 'POSITIVE',
        text: 'b'.repeat(5000),
    }).ok, true);

    assert.deepEqual(validateReviewContent({
        title: 'a'.repeat(121),
        sentiment: 'POSITIVE',
        text: 'Текст',
    }), { ok: false, error: 'Заголовок рецензии не должен превышать 120 символов' });
    assert.deepEqual(validateReviewContent({
        title: null,
        sentiment: 'UNKNOWN',
        text: 'Текст',
    }), { ok: false, error: 'Выберите корректное впечатление от фильма' });
    assert.deepEqual(validateReviewContent({
        title: null,
        sentiment: 'NEUTRAL',
        text: '   ',
    }), { ok: false, error: 'Введите текст рецензии' });
    assert.deepEqual(validateReviewContent({
        title: null,
        sentiment: 'NEGATIVE',
        text: 'b'.repeat(5001),
    }), { ok: false, error: 'Текст рецензии не должен превышать 5000 символов' });
});

test('review can be managed by its author or an administrator', () => {
    assert.equal(canManageReview({ userId: 'u1', role: 'USER' }, 'u1'), true);
    assert.equal(canManageReview({ userId: 'admin', role: 'ADMIN' }, 'u1'), true);
    assert.equal(canManageReview({ userId: 'u2', role: 'USER' }, 'u1'), false);
    assert.equal(canManageReview(null, 'u1'), false);
});

test('dependency-injected authorization returns safe errors for auth, missing rows, and ownership', async () => {
    const missingAuth = await authorizeReviewManagement('r1', {
        getActor: async () => null,
        findAuthorId: async () => 'u1',
    });
    assert.deepEqual(missingAuth, { ok: false, error: 'Требуется авторизация' });

    const missingReview = await authorizeReviewManagement('missing', {
        getActor: async () => ({ userId: 'u1', role: 'USER' }),
        findAuthorId: async () => null,
    });
    assert.deepEqual(missingReview, { ok: false, error: 'Рецензия не найдена' });

    const forbidden = await authorizeReviewManagement('r1', {
        getActor: async () => ({ userId: 'u2', role: 'USER' }),
        findAuthorId: async () => 'u1',
    });
    assert.deepEqual(forbidden, { ok: false, error: 'Недостаточно прав для управления рецензией' });

    const admin = await authorizeReviewManagement('r1', {
        getActor: async () => ({ userId: 'admin', role: 'ADMIN' }),
        findAuthorId: async () => 'u1',
    });
    assert.deepEqual(admin, { ok: true, actor: { userId: 'admin', role: 'ADMIN' } });
});

test('create review operation writes the authenticated payload and ignores notification failure', async () => {
    const writes: unknown[] = [];
    const notifications: string[] = [];
    const result = await createReviewOperation({
        movieId: 'movie-1',
        title: 'Заголовок',
        sentiment: 'POSITIVE',
        text: 'Текст рецензии',
    }, {
        getActor: async () => ({ userId: 'author-1', role: 'USER' }),
        movieExists: async (movieId) => movieId === 'movie-1',
        createReview: async (data) => {
            writes.push(data);
            return { id: 'review-1' };
        },
        dispatchNotifications: async (reviewId) => {
            notifications.push(reviewId);
            throw new Error('notification transport failed');
        },
    });

    assert.deepEqual(result, { ok: true });
    assert.deepEqual(writes, [ {
        movieId: 'movie-1',
        userId: 'author-1',
        title: 'Заголовок',
        sentiment: 'POSITIVE',
        text: 'Текст рецензии',
    } ]);
    assert.deepEqual(notifications, [ 'review-1' ]);
});

test('create review operation rejects unauthenticated and missing-movie requests before writing', async () => {
    let writes = 0;
    const dependencies = {
        getActor: async () => null as { userId: string; role: string } | null,
        movieExists: async () => true,
        createReview: async () => {
            writes += 1;
            return { id: 'review-1' };
        },
        dispatchNotifications: async () => undefined,
    };

    assert.deepEqual(await createReviewOperation({
        movieId: 'movie-1', title: null, sentiment: 'NEUTRAL', text: 'Текст',
    }, dependencies), { ok: false, error: 'Требуется авторизация' });

    dependencies.getActor = async () => ({ userId: 'author-1', role: 'USER' });
    dependencies.movieExists = async () => false;
    assert.deepEqual(await createReviewOperation({
        movieId: 'missing', title: null, sentiment: 'NEUTRAL', text: 'Текст',
    }, dependencies), { ok: false, error: 'Фильм не найден' });
    assert.equal(writes, 0);
});

test('update review operation allows the owner and sends the exact DB payload', async () => {
    const writes: unknown[] = [];
    const result = await updateReviewOperation({
        reviewId: 'review-1',
        title: null,
        sentiment: 'NEGATIVE',
        text: 'Обновленный текст',
    }, {
        getActor: async () => ({ userId: 'author-1', role: 'USER' }),
        findAuthorId: async () => 'author-1',
        updateReview: async (reviewId, data) => {
            writes.push({ reviewId, data });
            return 1;
        },
    });

    assert.deepEqual(result, { ok: true });
    assert.deepEqual(writes, [ {
        reviewId: 'review-1',
        data: { title: null, sentiment: 'NEGATIVE', text: 'Обновленный текст' },
    } ]);
});

test('review management operations allow admin and reject unauthorized or missing reviews', async () => {
    let deletes = 0;
    const adminDelete = await deleteReviewOperation('review-1', {
        getActor: async () => ({ userId: 'admin-1', role: 'ADMIN' }),
        findAuthorId: async () => 'author-1',
        deleteReview: async () => {
            deletes += 1;
            return 1;
        },
    });
    assert.deepEqual(adminDelete, { ok: true });
    assert.equal(deletes, 1);

    let updates = 0;
    const forbidden = await updateReviewOperation({
        reviewId: 'review-1', title: null, sentiment: 'NEUTRAL', text: 'Текст',
    }, {
        getActor: async () => ({ userId: 'viewer-1', role: 'USER' }),
        findAuthorId: async () => 'author-1',
        updateReview: async () => {
            updates += 1;
            return 1;
        },
    });
    assert.deepEqual(forbidden, { ok: false, error: 'Недостаточно прав для управления рецензией' });
    assert.equal(updates, 0);

    const missing = await deleteReviewOperation('missing', {
        getActor: async () => ({ userId: 'author-1', role: 'USER' }),
        findAuthorId: async () => null,
        deleteReview: async () => {
            deletes += 1;
            return 1;
        },
    });
    assert.deepEqual(missing, { ok: false, error: 'Рецензия не найдена' });
    assert.equal(deletes, 1);
});

test('review notification uses REVIEW type and combines optional title with full review text safely', () => {
    const notification = buildReviewNotification({
        authorName: 'Анна',
        movieId: 'movie-1',
        movieTitle: 'Фильм',
        reviewTitle: 'Сильная работа',
        reviewText: 'Текст рецензии',
    });

    assert.deepEqual(notification, {
        type: 'REVIEW',
        title: 'Анна оставил рецензию',
        body: 'Фильм: Сильная работа — Текст рецензии',
        href: '/movies/movie-1',
    });
});

test('review card renders avatar, sentiment, title, full text, edited marker, and opens author profile', () => {
    const review: MovieReview = {
        id: 'review-1',
        title: 'Очень точная рецензия',
        sentiment: 'POSITIVE',
        text: `Полный текст ${'без сокращений '.repeat(30)}`,
        createdAt: '2026-08-19T10:00:00.000Z',
        updatedAt: '2026-08-20T10:00:00.000Z',
        edited: true,
        author: {
            id: 'author-1',
            name: 'Анна',
            avatarUrl: 'https://example.com/anna.jpg',
        },
        canManage: true,
    };
    let openedUserId: string | null = null;
    const onOpenProfile = (event: Event) => {
        openedUserId = (event as CustomEvent<{ userId: string }>).detail.userId;
    };
    window.addEventListener('ay-movies:open-profile', onOpenProfile);

    try {
        const view = render(createElement(ReviewCard, {
            review,
            onEdit: () => undefined,
            onDelete: () => undefined,
        }));

        assert.equal(view.getByRole('img', { name: 'Анна' }).getAttribute('src'), review.author.avatarUrl);
        assert.equal(view.getByRole('article').getAttribute('data-sentiment'), 'POSITIVE');
        assert.ok(view.getByText(review.title!));
        assert.ok((view.container.textContent ?? '').includes(review.text.trim()));
        assert.ok(view.getByText(/изменено/));
        assert.ok(view.getByRole('button', { name: 'Редактировать рецензию' }));
        assert.ok(view.getByRole('button', { name: 'Удалить рецензию' }));

        fireEvent.click(view.getByRole('button', { name: 'Открыть профиль Анна' }));
        assert.equal(openedUserId, 'author-1');
    } finally {
        window.removeEventListener('ay-movies:open-profile', onOpenProfile);
    }
});

test('review sentiment controls expose labelled radio semantics', async () => {
    const view = await renderWithRouter(createElement(ReviewsSection, {
        movieId: 'movie-1',
        reviews: [],
        isAuthed: true,
        actions: {
            add: async () => ({ ok: true as const }),
            update: async () => ({ ok: true as const }),
            delete: async () => ({ ok: true as const }),
            refresh: async () => undefined,
        },
    }));

    assert.ok(view.getByRole('radiogroup', { name: 'Впечатление от фильма' }));
    const positive = view.getByRole('radio', { name: 'Положительная' });
    const neutral = view.getByRole('radio', { name: 'Нейтральная' });
    const negative = view.getByRole('radio', { name: 'Отрицательная' });
    assert.equal(positive.getAttribute('aria-checked'), 'false');
    assert.equal(neutral.getAttribute('aria-checked'), 'true');
    assert.equal(negative.getAttribute('aria-checked'), 'false');
    fireEvent.click(positive);
    assert.equal(positive.getAttribute('aria-checked'), 'true');
});

test('successful add clears its form without a local duplicate when refresh fails', async () => {
    const additions: ReviewContent[] = [];
    let refreshes = 0;
    const view = await renderWithRouter(createElement(ReviewsSection, {
        movieId: 'movie-1',
        reviews: [],
        isAuthed: true,
        actions: {
            add: async (content: ReviewContent) => {
                additions.push(content);
                return { ok: true as const };
            },
            update: async () => ({ ok: true as const }),
            delete: async () => ({ ok: true as const }),
            refresh: async () => {
                refreshes += 1;
                throw new Error('refresh failed');
            },
        },
    }));
    const title = view.getByRole('textbox', { name: 'Заголовок рецензии' });
    const text = view.getByRole('textbox', { name: 'Текст рецензии' });
    fireEvent.input(title, { target: { value: 'Новая рецензия' } });
    fireEvent.input(text, { target: { value: 'Новый текст' } });
    fireEvent.click(view.getByRole('button', { name: 'Опубликовать' }));

    await waitFor(() => {
        assert.equal(additions.length, 1);
        assert.equal((view.getByRole('textbox', { name: 'Заголовок рецензии' }) as HTMLInputElement).value, '');
        assert.equal((view.getByRole('textbox', { name: 'Текст рецензии' }) as HTMLTextAreaElement).value, '');
    });
    assert.equal(refreshes, 1);
    assert.equal(view.queryAllByRole('article').length, 0);
    assert.ok(view.getByText('Рецензий пока нет. Будьте первым.'));
});

test('successful update closes its editor even when refresh fails', async () => {
    let updates = 0;
    let refreshes = 0;
    const view = await renderWithRouter(createElement(ReviewsSection, {
        movieId: 'movie-1',
        reviews: [ manageableReview() ],
        isAuthed: true,
        actions: {
            add: async () => ({ ok: true as const }),
            update: async () => {
                updates += 1;
                return { ok: true as const };
            },
            delete: async () => ({ ok: true as const }),
            refresh: async () => {
                refreshes += 1;
                throw new Error('refresh failed');
            },
        },
    }));
    fireEvent.click(view.getByRole('button', { name: 'Редактировать рецензию' }));
    fireEvent.click(view.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => assert.equal(view.queryByRole('button', { name: 'Сохранить' }), null));
    assert.equal(updates, 1);
    assert.equal(refreshes, 1);
    assert.equal((view.getByRole('button', { name: 'Редактировать рецензию' }) as HTMLButtonElement).disabled, false);
});

test('shared mutation lock blocks double add and all review actions before rerender', async () => {
    const pendingAdd = deferred<{ ok: true }>();
    let addCalls = 0;
    let updateCalls = 0;
    let deleteCalls = 0;
    const view = await renderWithRouter(createElement(ReviewsSection, {
        movieId: 'movie-1',
        reviews: [ manageableReview() ],
        isAuthed: true,
        actions: {
            add: async () => {
                addCalls += 1;
                return pendingAdd.promise;
            },
            update: async () => {
                updateCalls += 1;
                return { ok: true as const };
            },
            delete: async () => {
                deleteCalls += 1;
                return { ok: true as const };
            },
            refresh: async () => undefined,
        },
    }));
    const text = view.getByRole('textbox', { name: 'Текст рецензии' });
    fireEvent.input(text, { target: { value: 'Новый текст' } });
    const publish = view.getByRole('button', { name: 'Опубликовать' }) as HTMLButtonElement;
    fireEvent.click(publish);
    fireEvent.click(publish);

    assert.equal(addCalls, 1);
    assert.equal(publish.disabled, true);
    const edit = view.getByRole('button', { name: 'Редактировать рецензию' }) as HTMLButtonElement;
    const remove = view.getByRole('button', { name: 'Удалить рецензию' }) as HTMLButtonElement;
    assert.equal(edit.disabled, true);
    assert.equal(remove.disabled, true);
    fireEvent.click(edit);
    fireEvent.click(remove);
    assert.equal(updateCalls, 0);
    assert.equal(deleteCalls, 0);

    pendingAdd.resolve({ ok: true });
    await waitFor(() => {
        const currentPublish = view.getByRole('button', { name: 'Опубликовать' }) as HTMLButtonElement;
        assert.equal(currentPublish.disabled, true);
        assert.equal((view.getByRole('button', { name: 'Редактировать рецензию' }) as HTMLButtonElement).disabled, false);
        assert.equal((view.getByRole('button', { name: 'Удалить рецензию' }) as HTMLButtonElement).disabled, false);
    });
});

test('shared mutation lock blocks double delete and add or edit actions', async () => {
    const pendingDelete = deferred<{ ok: true }>();
    let addCalls = 0;
    let deleteCalls = 0;
    let refreshes = 0;
    const originalConfirm = window.confirm;
    window.confirm = () => true;
    try {
        const view = await renderWithRouter(createElement(ReviewsSection, {
            movieId: 'movie-1',
            reviews: [ manageableReview() ],
            isAuthed: true,
            actions: {
                add: async () => {
                    addCalls += 1;
                    return { ok: true as const };
                },
                update: async () => ({ ok: true as const }),
                delete: async () => {
                    deleteCalls += 1;
                    return pendingDelete.promise;
                },
                refresh: async () => {
                    refreshes += 1;
                    throw new Error('refresh failed');
                },
            },
        }));
        fireEvent.input(view.getByRole('textbox', { name: 'Текст рецензии' }), {
            target: { value: 'Новый текст' },
        });
        const publish = view.getByRole('button', { name: 'Опубликовать' }) as HTMLButtonElement;
        const remove = view.getByRole('button', { name: 'Удалить рецензию' });
        fireEvent.click(remove);
        fireEvent.click(remove);

        assert.equal(deleteCalls, 1);
        const edit = view.getByRole('button', { name: 'Редактировать рецензию' }) as HTMLButtonElement;
        assert.equal(publish.disabled, true);
        assert.equal(edit.disabled, true);
        fireEvent.click(publish);
        fireEvent.click(edit);
        assert.equal(addCalls, 0);

        pendingDelete.resolve({ ok: true });
        await waitFor(() => assert.equal(publish.disabled, false));
        assert.equal(refreshes, 1);
    } finally {
        window.confirm = originalConfirm;
    }
});

test('guest review author links to sign in instead of dispatching an unusable profile event', () => {
    const review: MovieReview = {
        id: 'review-guest',
        title: null,
        sentiment: 'NEUTRAL',
        text: 'Текст',
        createdAt: '2026-08-20T10:00:00.000Z',
        updatedAt: '2026-08-20T10:00:00.000Z',
        edited: false,
        author: { id: 'author-1', name: 'Анна', avatarUrl: null },
        canManage: false,
    };
    let profileEvents = 0;
    const countProfileEvent = () => profileEvents += 1;
    window.addEventListener('ay-movies:open-profile', countProfileEvent);

    try {
        const view = render(createElement(ReviewCard, {
            review,
            isAuthed: false,
            onEdit: () => undefined,
            onDelete: () => undefined,
        }));
        const author = view.getByRole('link', { name: 'Войти, чтобы открыть профиль Анна' });
        assert.equal(author.getAttribute('href'), '/sign-in');
        fireEvent.click(author);
        assert.equal(profileEvents, 0);
    } finally {
        window.removeEventListener('ay-movies:open-profile', countProfileEvent);
    }
});

test('foreign profile never falls back to the current viewer identity after a load error', () => {
    const viewer = {
        id: 'viewer-1',
        name: 'Зритель',
        email: 'viewer@example.com',
        avatarUrl: null,
        role: 'USER' as const,
    };
    assert.equal(profileDialogFallback(viewer, false), null);
    assert.equal(profileDialogFallback(viewer, true)?.name, 'Зритель');
});

test('profile request controller ignores an older request that resolves after the current target', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const applied: string[] = [];
    const controller = createLatestProfileRequestController();

    const firstRun = controller.run(() => first.promise, {
        onSuccess: (profile) => applied.push(profile),
    });
    const secondRun = controller.run(() => second.promise, {
        onSuccess: (profile) => applied.push(profile),
    });

    second.resolve('new-profile');
    assert.equal(await secondRun, true);
    first.resolve('stale-profile');
    assert.equal(await firstRun, false);
    assert.deepEqual(applied, [ 'new-profile' ]);
});

test('public comments modules are removed and visible copy consistently says reviews', () => {
    assert.equal(existsSync('src/server/comments.ts'), false);
    assert.equal(existsSync('src/components/movies/CommentsSection.tsx'), false);

    const visibleCopyFiles = [
        'src/routes/movies/$movieId.tsx',
        'src/routes/profile.tsx',
        'src/routes/dashboard.$userId.tsx',
        'src/routes/dashboard.index.tsx',
        'src/routes/settings.tsx',
        'src/components/ProfileDialog.tsx',
        'src/components/movies/MovieCard.tsx',
    ];
    for (const path of visibleCopyFiles) {
        assert.doesNotMatch(readFileSync(path, 'utf8'), /Комментар|комментар/, path);
    }

    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
        scripts: Record<string, string>;
    };
    assert.equal(packageJson.scripts['test:reviews'], 'tsx --test scripts/reviews.test.ts');
    assert.match(packageJson.scripts.test, /pnpm test:reviews/);
});
