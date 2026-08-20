import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { Window } from 'happy-dom';

import { ReviewCard } from '../src/components/movies/ReviewsSection';
import { profileDialogFallback } from '../src/components/ProfileDialog';
import {
    authorizeReviewManagement,
    canManageReview,
    mapMovieReview,
    validateReviewContent,
    type MovieReview,
} from '../src/server/reviews';
import { buildReviewNotification } from '../src/server/notifications';

const browserWindow = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
    self: browserWindow,
    window: browserWindow,
    document: browserWindow.document,
    Node: browserWindow.Node,
    HTMLElement: browserWindow.HTMLElement,
    SVGElement: browserWindow.SVGElement,
    CustomEvent: browserWindow.CustomEvent,
    MutationObserver: browserWindow.MutationObserver,
    getComputedStyle: browserWindow.getComputedStyle.bind(browserWindow),
    requestAnimationFrame: browserWindow.requestAnimationFrame.bind(browserWindow),
    cancelAnimationFrame: browserWindow.cancelAnimationFrame.bind(browserWindow),
});

test.afterEach(() => cleanup());

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

    const reviewsSection = readFileSync('src/components/movies/ReviewsSection.tsx', 'utf8');
    assert.match(reviewsSection, /submitLabel="Опубликовать"\s+isSubmitting=\{isAdding\}/);

    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
        scripts: Record<string, string>;
    };
    assert.equal(packageJson.scripts['test:reviews'], 'tsx --test scripts/reviews.test.ts');
    assert.match(packageJson.scripts.test, /pnpm test:reviews/);
});
