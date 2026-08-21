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

function automaticVideo(position: number): MovieVideoMetadata {
    return {
        provider: 'kinopoisk-unofficial',
        site: 'YOUTUBE',
        title: `Трейлер ${position + 1}`,
        kind: position % 2 === 0 ? 'TRAILER' : 'TEASER',
        url: `https://www.youtube.com/watch?v=video${position}id`,
        position,
    };
}

test('trailer gallery creates a player only after selection and removes it on close', async () => {
    const view = render(createElement(MovieTrailers, {
        title: 'Фильм',
        posterUrl: 'https://example.com/poster.jpg',
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
        posterUrl: null,
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
        posterUrl: null,
        automaticVideos: [],
        manualUrls: [ 'https://example.com/trailer' ],
    }));

    const link = view.getByRole('link', { name: 'Открыть Трейлер 1' });
    assert.equal(link.getAttribute('href'), 'https://example.com/trailer');
    assert.equal(link.getAttribute('target'), '_blank');
    assert.equal(document.querySelectorAll('iframe').length, 0);
});
