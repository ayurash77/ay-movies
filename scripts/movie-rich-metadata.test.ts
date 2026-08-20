import assert from 'node:assert/strict';
import test from 'node:test';

import {
    mergeExternalRatings,
    normalizeCastSnapshot,
    normalizeExternalRatings,
} from '../src/lib/movie-rich-metadata';

test('normalizes valid ratings and removes invalid score or vote values', () => {
    assert.deepEqual(normalizeExternalRatings({
        kinopoisk: { value: 7.8, votes: 100 },
        imdb: { value: 8.1, votes: -1 },
        russianCritics: { value: 101, votes: 5 },
    }), {
        kinopoisk: { value: 7.8, votes: 100 },
        imdb: null,
        russianCritics: null,
    });
});

test('deduplicates cast by provider identity and preserves source order', () => {
    assert.deepEqual(normalizeCastSnapshot([
        {
            provider: 'kinopoisk-dev',
            externalId: '2',
            name: 'Второй',
            originalName: null,
            photoUrl: null,
            profession: 'actor',
            role: null,
            order: 1,
        },
        {
            provider: 'kinopoisk-dev',
            externalId: '1',
            name: 'Первый',
            originalName: null,
            photoUrl: null,
            profession: 'actor',
            role: 'Роль',
            order: 0,
        },
        {
            provider: 'kinopoisk-dev',
            externalId: '2',
            name: 'Дубликат',
            originalName: null,
            photoUrl: null,
            profession: 'actor',
            role: null,
            order: 2,
        },
    ]), [
        {
            provider: 'kinopoisk-dev',
            externalId: '1',
            name: 'Первый',
            originalName: null,
            photoUrl: null,
            profession: 'actor',
            role: 'Роль',
            order: 0,
        },
        {
            provider: 'kinopoisk-dev',
            externalId: '2',
            name: 'Второй',
            originalName: null,
            photoUrl: null,
            profession: 'actor',
            role: null,
            order: 1,
        },
    ]);
});

test('partial rating refresh preserves existing provider values', () => {
    assert.deepEqual(mergeExternalRatings(
        { kinopoisk: { value: 7.8, votes: 100 }, imdb: { value: 8.1, votes: 200 }, russianCritics: null },
        { kinopoisk: { value: 7.9, votes: 110 }, imdb: null, russianCritics: null },
    ), {
        kinopoisk: { value: 7.9, votes: 110 },
        imdb: { value: 8.1, votes: 200 },
        russianCritics: null,
    });
});
