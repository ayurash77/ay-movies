import assert from 'node:assert/strict';
import test from 'node:test';

import { groupMoviesByGenres, normalizeGenre } from '../src/lib/genre-groups';

test('normalizes close genre names into one standard genre', () => {
    assert.equal(normalizeGenre('Драма'), 'Драма');
    assert.equal(normalizeGenre('Драматический фильм'), 'Драма');
    assert.equal(normalizeGenre('драмы'), 'Драма');
});

test('groups a movie once per normalized genre', () => {
    const movies = [
        { id: '1', genres: [ 'Драма', 'Драматический фильм', 'Триллер' ] },
        { id: '2', genres: [ 'Комедийный' ] },
    ];

    const groups = groupMoviesByGenres(movies);
    const drama = groups.find(([ genre ]) => genre === 'Драма');
    const comedy = groups.find(([ genre ]) => genre === 'Комедия');

    assert.equal(drama?.[1].length, 1);
    assert.equal(comedy?.[1].length, 1);
});
