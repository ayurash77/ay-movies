import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement, type ComponentType, type ReactElement } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    Outlet,
    RouterProvider,
} from '@tanstack/react-router';
import { Window } from 'happy-dom';

import { MovieCast } from '../src/components/movies/MovieCast';
import { MovieRatings, RatingPickerPanel } from '../src/components/movies/MovieRatings';
import { RatingStars } from '../src/components/movies/RatingStars';
import type { MovieCastPerson } from '../src/lib/movie-data';
import type { PersonProfile } from '../src/lib/person-data';

function read(path: string) {
    try {
        return readFileSync(path, 'utf8');
    } catch {
        return '';
    }
}

const browserWindow = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
    self: browserWindow,
    window: browserWindow,
    document: browserWindow.document,
    Node: browserWindow.Node,
    HTMLElement: browserWindow.HTMLElement,
    SVGElement: browserWindow.SVGElement,
    MutationObserver: browserWindow.MutationObserver,
    getComputedStyle: browserWindow.getComputedStyle.bind(browserWindow),
    requestAnimationFrame: browserWindow.requestAnimationFrame.bind(browserWindow),
    cancelAnimationFrame: browserWindow.cancelAnimationFrame.bind(browserWindow),
});

test.afterEach(() => cleanup());

async function renderWithRouter(element: ReactElement) {
    const rootRoute = createRootRoute({
        component: () => createElement(Outlet),
    });
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
    const personRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/people/$personId',
        component: () => null,
    });
    const router = createRouter({
        routeTree: rootRoute.addChildren([ indexRoute, signInRoute, personRoute ]),
        history: createMemoryHistory({ initialEntries: [ '/' ] }),
    });
    await router.load();
    return render(createElement(RouterProvider, { router }));
}

function castMember(index: number, photoUrl: string | null = null): MovieCastPerson {
    return {
        provider: 'kinopoisk-dev',
        externalId: String(index),
        personId: `person-${index}`,
        name: `Актёр ${index}`,
        originalName: null,
        photoUrl,
        profession: 'actor',
        role: `Роль ${index}`,
        order: index - 1,
    };
}

test('movie description is not mixed with repeated metadata or a standalone rating', () => {
    const detail = read('src/routes/movies/$movieId.tsx');

    assert.match(detail, /<h2[^>]*>Описание<\/h2>[\s\S]*\{movie\.description\}/);
    assert.doesNotMatch(detail, /function DetailsTable|<DetailsTable/);
    assert.doesNotMatch(detail, /<RatingStars value=\{movie\.avgRating\}/);
    assert.doesNotMatch(detail, /Ваша оценка:[\s\S]*<RatingStars/);
});

test('about section composes trailers, description, ratings, cast, watch links, then reviews', () => {
    const detail = read('src/routes/movies/$movieId.tsx');
    const sectionStart = detail.indexOf('function AboutSection');
    const sectionEnd = detail.indexOf('function SeriesTabs');
    const section = detail.slice(sectionStart, sectionEnd);

    const orderedParts = [
        '<TrailerSection',
        'Описание',
        '<MovieRatings',
        '<MovieCast',
        '<WatchLinksSection',
        '<ReviewsSection',
    ];
    let previous = -1;
    for (const part of orderedParts) {
        const index = section.indexOf(part);
        assert.ok(index > previous, `${part} должен идти в согласованном порядке`);
        previous = index;
    }

    assert.match(detail, /<SeriesSeasons movie=\{movie\}\/>/);
});

test('ratings render available providers, auth branch, and correct vote declension', async () => {
    const renderer = await renderWithRouter(createElement(MovieRatings, {
        externalRatings: {
            kinopoisk: { value: 7.8, votes: 1 },
            imdb: null,
            russianCritics: { value: 85, votes: 2 },
        },
        avgRating: 8.4,
        ratingCount: 5,
        myRating: null,
        isAuthed: false,
        onRate: () => undefined,
    }));
    const content = renderer.container.textContent ?? '';

    assert.match(content, /Кинопоиск/);
    assert.doesNotMatch(content, /IMDb/);
    assert.match(content, /Критики/);
    assert.match(content, /AY Movies/);
    assert.match(content, /8[,.]4/);
    assert.doesNotMatch(content, /\/ 5/);
    assert.match(content, /1 голос(?![а-я])/);
    assert.match(content, /2 голоса/);
    assert.match(content, /5 голосов/);
    assert.equal(renderer.getByRole('link', { name: 'Войти и оценить' }).getAttribute('href'), '/sign-in');
});

test('ratings grid does not reserve empty provider columns', () => {
    const source = read('src/components/movies/MovieRatings.tsx');

    assert.doesNotMatch(source, /col-span-full|sm:col-span-2/);
    assert.match(source, /repeat\(auto-fit,minmax/);
});

test('authenticated rating exposes a popover trigger', async () => {
    const renderer = await renderWithRouter(createElement(MovieRatings, {
        externalRatings: { kinopoisk: null, imdb: null, russianCritics: null },
        avgRating: 9,
        ratingCount: 21,
        myRating: null,
        isAuthed: true,
        onRate: () => undefined,
    }));

    const trigger = renderer.getByRole('button', { name: 'Оценить' });
    fireEvent.click(trigger);
    assert.equal(trigger.getAttribute('aria-expanded'), 'true');
});

test('ten-point rating control saves the selected value', () => {
    const selected: Array<number | null> = [];
    const renderer = render(createElement(RatingPickerPanel, {
        value: null,
        onRate: (value) => {
            selected.push(value);
        },
        onClose: () => undefined,
    }));

    const eighthPoint = renderer.getByRole('radio', { name: '8 из 10' });
    assert.equal(renderer.getAllByRole('radio').length, 10);
    fireEvent.click(eighthPoint);
    assert.equal(eighthPoint.getAttribute('aria-checked'), 'true');
    fireEvent.click(renderer.getByRole('button', { name: 'Сохранить оценку' }));
    assert.deepEqual(selected, [ 8 ]);
});

test('existing rating can be removed from the rating popover', () => {
    const selected: Array<number | null> = [];
    const renderer = render(createElement(RatingPickerPanel, {
        value: 7,
        onRate: (value) => {
            selected.push(value);
        },
        onClose: () => undefined,
    }));

    assert.equal(renderer.getByRole('radio', { name: '7 из 10' }).getAttribute('aria-checked'), 'true');
    fireEvent.click(renderer.getByRole('button', { name: 'Удалить оценку' }));
    assert.deepEqual(selected, [ null ]);
});

test('rejected rating keeps the picker open', async () => {
    let closed = false;
    const renderer = render(createElement(RatingPickerPanel, {
        value: 6,
        onRate: () => false,
        onClose: () => {
            closed = true;
        },
    }));

    fireEvent.click(renderer.getByRole('button', { name: 'Сохранить оценку' }));
    await Promise.resolve();
    assert.equal(closed, false);
});

test('rating control uses roving focus and arrow-key navigation', () => {
    const renderer = render(createElement(RatingPickerPanel, {
        value: 6,
        onRate: () => undefined,
        onClose: () => undefined,
    }));
    const sixthPoint = renderer.getByRole('radio', { name: '6 из 10' });
    const seventhPoint = renderer.getByRole('radio', { name: '7 из 10' });

    assert.equal(sixthPoint.tabIndex, 0);
    assert.equal(seventhPoint.tabIndex, -1);
    sixthPoint.focus();
    fireEvent.keyDown(sixthPoint, { key: 'ArrowRight' });
    assert.equal(seventhPoint.getAttribute('aria-checked'), 'true');
    assert.equal(renderer.container.ownerDocument.activeElement, seventhPoint);
});

test('rating control ignores a repeated save while the first request is pending', async () => {
    let requestCount = 0;
    let finishRequest: ((value: boolean) => void) | undefined;
    const renderer = render(createElement(RatingPickerPanel, {
        value: 6,
        onRate: () => {
            requestCount++;
            return new Promise<boolean>((resolve) => {
                finishRequest = resolve;
            });
        },
        onClose: () => undefined,
    }));
    const saveButton = renderer.getByRole('button', { name: 'Сохранить оценку' });

    fireEvent.click(saveButton);
    fireEvent.click(saveButton);
    assert.equal(requestCount, 1);
    finishRequest?.(true);
    await Promise.resolve();
});

test('read-only stars map the ten-point rating to five compact stars', () => {
    const renderer = render(createElement(RatingStars, { value: 4 }));
    const stars = Array.from(renderer.container.querySelectorAll('[data-rating-star]'));
    assert.equal(stars.length, 5);
    assert.equal(renderer.container.querySelectorAll('button').length, 0);
    assert.ok(renderer.getByLabelText('Рейтинг 4.0 из 10'));
});

test('cast prefers rich entries and expands and collapses the first eight actors', async () => {
    const cast = Array.from({ length: 10 }, (_, index) => castMember(index + 1));
    const renderer = await renderWithRouter(createElement(MovieCast, {
        cast,
        legacyStarring: [ 'Legacy Actor' ],
    }));
    const personLinks = () => renderer.getAllByRole('link').filter((link) => (
        link.getAttribute('href')?.startsWith('/people/')
    ));
    const toggle = () => renderer.getByRole('button');

    assert.equal(renderer.container.textContent?.includes('Legacy Actor'), false);
    assert.match(renderer.container.textContent ?? '', /Роль 1/);
    assert.equal(personLinks().length, 8);
    assert.equal(toggle().getAttribute('aria-expanded'), 'false');
    const castGridId = toggle().getAttribute('aria-controls');
    assert.ok(castGridId);
    assert.ok(renderer.container.ownerDocument.getElementById(castGridId));

    fireEvent.click(toggle());
    assert.equal(personLinks().length, 10);
    assert.equal(toggle().textContent, 'Свернуть');
    assert.equal(toggle().getAttribute('aria-expanded'), 'true');

    fireEvent.click(toggle());
    assert.equal(personLinks().length, 8);
    assert.equal(toggle().textContent, 'Все');
});

test('cast uses legacy fallback only without rich entries', () => {
    const renderer = render(createElement(MovieCast, {
        cast: [],
        legacyStarring: [ 'Первый', 'Второй' ],
    }));

    assert.match(renderer.container.textContent ?? '', /Первый, Второй/);
});

test('cast portrait replaces a failed image with a stable placeholder', async () => {
    const renderer = await renderWithRouter(createElement(MovieCast, {
        cast: [ castMember(1, 'https://example.com/actor.jpg') ],
        legacyStarring: [],
    }));
    const image = renderer.container.querySelector('img');
    assert.ok(image);
    assert.equal(image.getAttribute('alt'), '');

    fireEvent.error(image);
    assert.equal(renderer.queryByRole('img'), null);
    assert.match(renderer.container.textContent ?? '', /Актёр 1/);
});

test('cast entries use compact round portraits with name and role to the right', async () => {
    const renderer = await renderWithRouter(createElement(MovieCast, {
        cast: [ castMember(1, 'https://example.com/actor.jpg') ],
        legacyStarring: [],
    }));
    const image = renderer.container.querySelector('img');
    assert.ok(image);
    const personLink = renderer.getByRole('link');

    assert.match(image.className, /rounded-full/);
    assert.match(image.className, /size-12/);
    assert.match(personLink.className, /flex/);
    assert.match(personLink.className, /h-\[84px\]/);
    assert.match(personLink.textContent ?? '', /Актёр 1/);
    assert.match(personLink.textContent ?? '', /Роль 1/);
    const name = renderer.getByRole('heading', { level: 3 });
    const role = renderer.getByText('Роль 1');
    assert.match(name.className, /line-clamp-2/);
    assert.doesNotMatch(name.className, /truncate/);
    assert.match(role.className, /line-clamp-2/);
    assert.match(role.className, /text-\[11px\]/);
});

test('movie rating server accepts ten points, supports removal, and migrates legacy values', () => {
    const server = read('src/server/movies.ts');
    const migration = read('prisma/migrations/20260821100000_rating_ten_point/migration.sql');
    const seed = read('prisma/seed.ts');
    const ratings = read('src/components/movies/MovieRatings.tsx');

    assert.match(server, /value: z\.number\(\)\.int\(\)\.min\(1\)\.max\(10\)\.nullable\(\)/);
    assert.match(server, /db\.rating\.deleteMany/);
    assert.match(migration, /^BEGIN;/);
    assert.match(migration, /WHERE "value" NOT BETWEEN 1 AND 5/);
    assert.match(migration, /SET "value" = "value" \* 2/);
    assert.match(migration, /CHECK \("value" BETWEEN 1 AND 10\)/);
    assert.match(migration, /COMMIT;\s*$/);
    assert.match(seed, /const value = 4 \+ Math\.floor\(rand\(\) \* 7\); \/\/ 4\.\.10/);
    assert.match(ratings, /aria-label="Оценить фильм"/);
});

test('person route helpers cover back fallback, loader error, and image failure', async () => {
    const routeModule = await import('../src/routes/people/$personId') as Record<string, unknown>;
    const personBackAction = routeModule.personBackAction as ((historyLength: number) => 'back' | 'home');
    const PersonPageContent = routeModule.PersonPageContent as ComponentType<{
        result: { ok: false; error: string };
    }>;
    const PersonPortrait = routeModule.PersonPortrait as ComponentType<{ person: PersonProfile }>;

    assert.equal(typeof personBackAction, 'function');
    assert.equal(personBackAction(2), 'back');
    assert.equal(personBackAction(1), 'home');

    const errorView = render(createElement(PersonPageContent, {
        result: { ok: false, error: 'Персона не найдена' },
    }));
    assert.equal(errorView.getByText('Персона не найдена').tagName, 'P');
    errorView.unmount();

    const person: PersonProfile = {
        provider: 'kinopoisk-dev',
        externalId: '1',
        name: 'Актёр',
        originalName: null,
        photoUrl: 'https://example.com/person.jpg',
        sex: null,
        growthCm: null,
        birthDate: null,
        deathDate: null,
        birthPlace: [],
        professions: [ 'актёр' ],
        facts: [],
        filmography: [],
    };
    const portraitView = render(createElement(PersonPortrait, { person }));
    fireEvent.error(portraitView.getByRole('img', { name: 'Актёр' }));
    assert.equal(portraitView.queryByRole('img'), null);
    assert.ok(portraitView.container.querySelector('.aspect-2\\/3'));
});

test('person page uses the app header and filmography links local or external titles', () => {
    const route = read('src/routes/people/$personId.tsx');
    const filmography = read('src/components/people/PersonFilmography.tsx');

    assert.match(route, /getPerson\(\{ data: \{ personId: params\.personId \} \}\)/);
    assert.match(route, /<PageTitle[\s\S]*leading=\{headerLeading\}/);
    assert.match(route, /aria-label="Назад"/);
    assert.match(route, /<PersonFilmography/);

    assert.match(filmography, /to="\/movies\/\$movieId"/);
    assert.match(filmography, /useLocation/);
    assert.match(filmography, /search=\{\{ from: currentPath \}\}/);
    assert.match(filmography, /https:\/\/www\.kinopoisk\.ru\/film\/\$\{entry\.externalId\}\//);
    assert.match(filmography, /target="_blank"/);
    assert.match(filmography, /rel="noreferrer"/);
    assert.match(filmography, /aspect-2\/3/);
    assert.match(filmography, /formatFilmographyType\(entry\.type\)/);
});
