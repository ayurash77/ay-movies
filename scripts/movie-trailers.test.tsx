import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { Window } from 'happy-dom';

import type { MovieVideoMetadata } from '../src/lib/movie-videos';

const browserWindow = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
    self: browserWindow,
    window: browserWindow,
    document: browserWindow.document,
    Node: browserWindow.Node,
    NodeFilter: browserWindow.NodeFilter,
    Event: browserWindow.Event,
    CustomEvent: browserWindow.CustomEvent,
    EventTarget: browserWindow.EventTarget,
    HTMLElement: browserWindow.HTMLElement,
    HTMLInputElement: browserWindow.HTMLInputElement,
    SVGElement: browserWindow.SVGElement,
    MutationObserver: browserWindow.MutationObserver,
    getComputedStyle: browserWindow.getComputedStyle.bind(browserWindow),
    requestAnimationFrame: browserWindow.requestAnimationFrame.bind(browserWindow),
    cancelAnimationFrame: browserWindow.cancelAnimationFrame.bind(browserWindow),
});

let MovieTrailers: typeof import('../src/components/movies/MovieTrailers')['MovieTrailers'];

test.before(async () => {
    ({ MovieTrailers } = await import('../src/components/movies/MovieTrailers'));
});

test.afterEach(() => cleanup());

function automaticVideo(
    position: number,
    thumbnailUrl: string | null = `https://example.com/trailer-${position}.jpg`,
    url = `https://www.youtube.com/watch?v=video${position}id`,
): MovieVideoMetadata {
    return {
        provider: 'kinopoisk-unofficial',
        site: url.includes('widgets.kinopoisk.ru') ? 'KINOPOISK_WIDGET' : 'YOUTUBE',
        title: `Трейлер ${position + 1}`,
        kind: position % 2 === 0 ? 'TRAILER' : 'TEASER',
        url,
        thumbnailUrl,
        position,
    };
}

test('trailer cards use individual video thumbnails instead of the movie poster', () => {
    const view = render(createElement(MovieTrailers, {
        title: 'Фильм',
        automaticVideos: [ automaticVideo(1), automaticVideo(2) ],
        manualUrls: [],
    }));

    assert.deepEqual(
        Array.from(view.container.querySelectorAll('img'))
            .map((image) => image.getAttribute('src'))
            .sort(),
        [
            'https://example.com/trailer-1.jpg',
            'https://example.com/trailer-2.jpg',
        ].sort(),
    );
});

test('missing trailer thumbnail uses a neutral fallback instead of the movie poster', () => {
    const view = render(createElement(MovieTrailers, {
        title: 'Фильм',
        automaticVideos: [ automaticVideo(
            1,
            null,
            'https://widgets.kinopoisk.ru/discovery/trailer/42',
        ) ],
        manualUrls: [],
    }));

    assert.equal(view.container.querySelector('img'), null);
    assert.ok(view.getByTestId('video-thumbnail-fallback'));
});

test('trailer gallery creates a player only after selection and removes it on close', async () => {
    const view = render(createElement(MovieTrailers, {
        title: 'Фильм',
        automaticVideos: Array.from({ length: 6 }, (_, index) => automaticVideo(index)),
        manualUrls: [],
    }));

    assert.ok(view.getByRole('heading', { name: 'Трейлеры и тизеры' }));
    assert.ok(view.getByRole('button', { name: 'Все' }));
    assert.equal(document.querySelectorAll('iframe').length, 0);

    fireEvent.click(view.getByRole('button', { name: 'Смотреть Трейлер 1' }));
    assert.ok(await view.findByRole('dialog', { name: 'Трейлер 1' }));
    assert.equal(document.querySelectorAll('iframe').length, 1);

    fireEvent.click(view.getByRole('button', { name: 'Закрыть' }));
    await waitFor(() => assert.equal(document.querySelectorAll('iframe').length, 0));
});

test('all action reveals videos beyond the compact preview', async () => {
    const view = render(createElement(MovieTrailers, {
        title: 'Фильм',
        automaticVideos: Array.from({ length: 6 }, (_, index) => automaticVideo(index)),
        manualUrls: [],
    }));

    assert.equal(view.queryByRole('button', { name: 'Смотреть Трейлер 6' }), null);
    fireEvent.click(view.getByRole('button', { name: 'Все' }));
    assert.ok(await view.findByRole('dialog', { name: 'Все трейлеры и тизеры' }));
    assert.ok(view.getByRole('button', { name: 'Смотреть Трейлер 6' }));
    assert.equal(document.querySelectorAll('iframe').length, 0);
});

test('unsupported manual video remains an external link', () => {
    const view = render(createElement(MovieTrailers, {
        title: 'Фильм',
        automaticVideos: [],
        manualUrls: [ 'https://example.com/trailer' ],
    }));

    const link = view.getByRole('link', { name: 'Открыть Трейлер 1' });
    assert.equal(link.getAttribute('href'), 'https://example.com/trailer');
    assert.equal(link.getAttribute('target'), '_blank');
    assert.equal(document.querySelectorAll('iframe').length, 0);
});

test('Kinopoisk trailer opens externally because the provider forbids iframe embedding', () => {
    const url = 'https://widgets.kinopoisk.ru/discovery/trailer/42';
    const view = render(createElement(MovieTrailers, {
        title: 'Фильм',
        automaticVideos: [ automaticVideo(0, null, url) ],
        manualUrls: [],
    }));

    const link = view.getByRole('link', { name: 'Открыть Трейлер 1' });
    assert.equal(link.getAttribute('href'), url);
    assert.equal(link.getAttribute('target'), '_blank');
    assert.equal(document.querySelectorAll('iframe').length, 0);
});
