import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { Window } from 'happy-dom';

import { MovieForm } from '../src/components/movies/MovieForm';
import type { MovieFormFields } from '../src/lib/movie-data';

const browserWindow = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
    self: browserWindow,
    window: browserWindow,
    document: browserWindow.document,
    Node: browserWindow.Node,
    HTMLElement: browserWindow.HTMLElement,
    HTMLFormElement: browserWindow.HTMLFormElement,
    SVGElement: browserWindow.SVGElement,
    File: browserWindow.File,
    FormData: browserWindow.FormData,
    MutationObserver: browserWindow.MutationObserver,
    getComputedStyle: browserWindow.getComputedStyle.bind(browserWindow),
    requestAnimationFrame: browserWindow.requestAnimationFrame.bind(browserWindow),
    cancelAnimationFrame: browserWindow.cancelAnimationFrame.bind(browserWindow),
});

test.afterEach(() => cleanup());

const videos = [ {
    provider: 'kinopoisk-unofficial' as const,
    site: 'KINOPOISK_WIDGET',
    title: 'Официальный трейлер',
    kind: 'TRAILER' as const,
    url: 'https://widgets.kinopoisk.ru/discovery/trailer/42',
    thumbnailUrl: null,
    position: 0,
} ];

const defaults: Partial<MovieFormFields> = {
    kind: 'MOVIE',
    title: 'Тестовый фильм',
    year: 2026,
    country: 'Россия',
    description: 'Описание фильма',
    videos,
};

test('movie form submits automatic videos after successful metadata import', async () => {
    const submissions: MovieFormFields[] = [];
    const view = render(createElement(MovieForm, {
        defaults,
        submitLabel: 'Сохранить',
        metadataImportSucceeded: true,
        onSubmit: async (fields) => {
            submissions.push(fields);
        },
    }));

    fireEvent.submit(view.container.querySelector('form')!);
    await waitFor(() => assert.equal(submissions.length, 1));
    assert.deepEqual(submissions[0]?.videos, videos);
});

test('movie form does not submit stale automatic videos without a successful import', async () => {
    const submissions: MovieFormFields[] = [];
    const view = render(createElement(MovieForm, {
        defaults,
        submitLabel: 'Сохранить',
        metadataImportSucceeded: false,
        onSubmit: async (fields) => {
            submissions.push(fields);
        },
    }));

    fireEvent.submit(view.container.querySelector('form')!);
    await waitFor(() => assert.equal(submissions.length, 1));
    assert.equal(submissions[0]?.videos, undefined);
});

test('movie form omits zero season metadata returned for a film', async () => {
    const submissions: MovieFormFields[] = [];
    const view = render(createElement(MovieForm, {
        defaults: {
            ...defaults,
            seasonsCount: 0,
            episodesPerSeason: '',
        },
        submitLabel: 'Сохранить',
        metadataImportSucceeded: true,
        onSubmit: async (fields) => {
            submissions.push(fields);
        },
    }));

    fireEvent.submit(view.container.querySelector('form')!);
    await waitFor(() => assert.equal(submissions.length, 1));
    assert.equal(submissions[0]?.seasonsCount, undefined);
    assert.equal(submissions[0]?.episodesPerSeason, undefined);
});
