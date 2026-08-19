import assert from 'node:assert/strict';
import test from 'node:test';

import { GENRE_OPTIONS, groupMoviesByGenres, normalizeGenre, normalizeGenreOptions } from '../src/lib/genre-groups';

test('normalizes close genre names into one standard genre', () => {
    assert.equal(normalizeGenre('Драма'), 'Драма');
    assert.equal(normalizeGenre('Драматический фильм'), 'Драма');
    assert.equal(normalizeGenre('драматический сериал'), 'Драма');
    assert.equal(normalizeGenre('драмы'), 'Драма');
    assert.equal(normalizeGenre('криминальная драма'), 'Криминал');
    assert.equal(normalizeGenre('фильм-тайна'), 'Детектив');
    assert.equal(normalizeGenre('телесериал о загадке'), 'Детектив');
    assert.equal(normalizeGenre('романтический фильм'), 'Мелодрама');
    assert.equal(normalizeGenre('научно-фантастический фильм'), 'Фантастика');
    assert.equal(normalizeGenre('фэнтезийный фильм'), 'Фэнтези');
    assert.equal(normalizeGenre('фильм ужасов'), 'Ужасы');
    assert.equal(normalizeGenre('психологический фильм-триллер'), 'Триллер');
    assert.equal(normalizeGenre('шпионский триллер'), 'Шпионский');
    assert.equal(normalizeGenre('spy thriller'), 'Шпионский');
    assert.equal(normalizeGenre('бадди-муви'), 'Другое');
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

test('keeps genre groups compact for detailed movie genres', () => {
    const movies = [
        {
            id: '1',
            genres: [
                'драматический фильм',
                'криминальная драма',
                'фильм-тайна',
                'научно-фантастический экшн',
                'романтический фильм',
                'бадди-муви',
            ],
        },
    ];

    const groupNames = groupMoviesByGenres(movies).map(([ genre ]) => genre);

    assert.deepEqual(groupNames, [
        'Детектив',
        'Драма',
        'Другое',
        'Криминал',
        'Мелодрама',
        'Фантастика',
    ]);
});

test('exposes only concrete genres for movie forms', () => {
    assert.deepEqual(GENRE_OPTIONS, [
        'Анимация',
        'Боевик',
        'Детектив',
        'Драма',
        'Комедия',
        'Криминал',
        'Мелодрама',
        'Приключения',
        'Шпионский',
        'Триллер',
        'Ужасы',
        'Фантастика',
        'Фэнтези',
    ]);
});

test('normalizes movie form genres without the generic fallback option', () => {
    assert.deepEqual(
        normalizeGenreOptions([ 'драматический фильм', 'бадди-муви', 'триллер' ]),
        [ 'Драма', 'Триллер' ],
    );
});
