import assert from 'node:assert/strict';
import test from 'node:test';

import { chooseCanonicalMovie, mergeMovieFields, normalizeStoredGenres } from '../src/lib/movie-merge';

const baseMovie = {
    id: 'a',
    kind: 'MOVIE',
    title: 'Фильм',
    year: 2024,
    country: 'Россия',
    description: 'Коротко',
    posterUrl: null,
    trailerUrls: [],
    watchLinks: [],
    director: null,
    genres: [ 'драматический фильм' ],
    durationMin: null,
    seasonsCount: null,
    episodesPerSeason: [],
    starring: [],
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
};

test('chooses the oldest movie as canonical duplicate target', () => {
    const canonical = chooseCanonicalMovie([
        { ...baseMovie, id: 'new', createdAt: new Date('2024-02-01T00:00:00.000Z') },
        { ...baseMovie, id: 'old', createdAt: new Date('2024-01-01T00:00:00.000Z') },
    ]);

    assert.equal(canonical.id, 'old');
});

test('normalizes stored genres to compact standard genres', () => {
    assert.deepEqual(
        normalizeStoredGenres([ 'Драма', 'драматический фильм', 'криминальная драма', 'бадди-муви' ]),
        [ 'Драма', 'Криминал', 'Другое' ],
    );
});

test('merges duplicate movie fields without dropping useful data', () => {
    const merged = mergeMovieFields(baseMovie, [
        {
            ...baseMovie,
            id: 'b',
            description: 'Более подробное описание фильма',
            posterUrl: 'https://example.com/poster.webp',
            trailerUrls: [ 'https://example.com/trailer' ],
            watchLinks: [ 'https://example.com/watch' ],
            director: 'Режиссер',
            genres: [ 'триллер' ],
            durationMin: 120,
            starring: [ 'Актер' ],
        },
    ]);

    assert.equal(merged.description, 'Более подробное описание фильма');
    assert.equal(merged.posterUrl, 'https://example.com/poster.webp');
    assert.equal(merged.director, 'Режиссер');
    assert.equal(merged.durationMin, 120);
    assert.deepEqual(merged.trailerUrls, [ 'https://example.com/trailer' ]);
    assert.deepEqual(merged.watchLinks, [ 'https://example.com/watch' ]);
    assert.deepEqual(merged.genres, [ 'Драма', 'Триллер' ]);
    assert.deepEqual(merged.starring, [ 'Актер' ]);
});
