import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMovieDedupeKey, normalizeMovieTitle } from '../src/lib/movie-dedupe';

test('normalizes movie title for duplicate detection', () => {
    assert.equal(normalizeMovieTitle('  Ёлки:  новые!!!  '), 'елки новые');
    assert.equal(normalizeMovieTitle('Криминальное   чтиво'), 'криминальное чтиво');
});

test('builds the same duplicate key for the same movie identity', () => {
    assert.equal(
        buildMovieDedupeKey({ kind: 'MOVIE', title: 'Криминальное чтиво', year: 1994 }),
        buildMovieDedupeKey({ kind: 'MOVIE', title: ' криминальное   чтиво ', year: 1994 }),
    );
});

test('keeps movies with different kind or year separate', () => {
    const movieKey = buildMovieDedupeKey({ kind: 'MOVIE', title: 'Шерлок', year: 2010 });
    const seriesKey = buildMovieDedupeKey({ kind: 'SERIES', title: 'Шерлок', year: 2010 });
    const remakeKey = buildMovieDedupeKey({ kind: 'MOVIE', title: 'Шерлок', year: 2009 });

    assert.notEqual(movieKey, seriesKey);
    assert.notEqual(movieKey, remakeKey);
});
