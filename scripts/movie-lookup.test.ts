import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    movieLookupCandidateSchema,
    type MovieLookupCandidate,
} from '../src/lib/movie-lookup-types';
import {
    buildLookupAttempts,
    claimSeriesInfo,
    claimSeriesParts,
    claimYear,
    isMediaEntity,
    type LookupWikidataEntity,
} from '../src/lib/movie-lookup-utils';

function entity(
    ids: string[],
    dates: Record<string, string[]> = {},
    quantities: Record<string, string[]> = {},
    parts: Array<{ id: string; ordinal: number }> = [],
): LookupWikidataEntity {
    return {
        claims: {
            P31: ids.map((id) => ({ mainsnak: { datavalue: { value: { id } } } })),
            P527: parts.map((part) => ({
                mainsnak: { datavalue: { value: { id: part.id } } },
                qualifiers: {
                    P1545: [
                        { datavalue: { value: String(part.ordinal) } },
                    ],
                },
            })),
            ...Object.fromEntries(
                Object.entries(dates).map(([ prop, values ]) => [
                    prop,
                    values.map((time) => ({ mainsnak: { datavalue: { value: { time } } } })),
                ]),
            ),
            ...Object.fromEntries(
                Object.entries(quantities).map(([ prop, values ]) => [
                    prop,
                    values.map((amount) => ({ mainsnak: { datavalue: { value: { amount, unit: '1' } } } })),
                ]),
            ),
        },
    };
}

test('movie lookup candidate schema accepts provider metadata', () => {
    const candidate: MovieLookupCandidate = {
        found: true,
        provider: 'kinopoisk-dev',
        providerLabel: 'Кинопоиск',
        externalId: '123',
        sourceUrl: 'https://www.kinopoisk.ru/film/123/',
        confidence: 92,
        rating: 8.4,
        kind: 'SERIES',
        title: 'Игра престолов',
        originalTitle: 'Game of Thrones',
        year: 2011,
        country: 'США, Великобритания',
        description: 'Описание',
        director: null,
        genres: [ 'драма', 'фэнтези' ],
        starring: [ 'Питер Динклэйдж' ],
        durationMin: 55,
        seasonsCount: 8,
        episodesPerSeason: [ 10, 10, 10, 10, 10, 10, 7, 6 ],
        posterUrl: 'https://example.com/poster.jpg',
    };

    assert.deepEqual(movieLookupCandidateSchema.parse(candidate), candidate);
});

test('movie lookup exposes candidate entrypoint and keeps compatibility wrapper', () => {
    const source = readFileSync('src/server/movie-lookup.ts', 'utf8');

    assert.match(source, /lookupMovieCandidates/);
    assert.match(source, /lookupWikidataCandidates/);
    assert.match(source, /lookupMovie = createServerFn/);
    assert.match(source, /candidates\[0\]/);
});

test('movie lookup tries exact title before film suffix and includes series suffixes', () => {
    assert.deepEqual(buildLookupAttempts('медленные лошади').slice(0, 6), [
        [ 'ru', 'медленные лошади' ],
        [ 'ru', 'медленные лошади сериал' ],
        [ 'ru', 'медленные лошади фильм' ],
        [ 'en', 'медленные лошади' ],
        [ 'en', 'медленные лошади tv series' ],
        [ 'en', 'медленные лошади film' ],
    ]);
});

test('movie lookup accepts media entities and rejects people', () => {
    assert.equal(isMediaEntity(entity([ 'Q5398426' ]), ''), true);
    assert.equal(isMediaEntity(entity([ 'Q11424' ]), ''), true);
    assert.equal(isMediaEntity(entity([ 'Q5' ]), 'Паоло Соррентино'), false);
    assert.equal(isMediaEntity(entity([ 'Q4167410' ]), 'Игра престолов — книга и телесериал'), false);
});

test('movie lookup reads series start year when publication date is absent', () => {
    assert.equal(claimYear(entity([ 'Q5398426' ], { P580: [ '+2022-04-01T00:00:00Z' ] })), 2022);
});

test('movie lookup reads seasons and evenly distributed episode counts for series', () => {
    assert.deepEqual(
        claimSeriesInfo(entity([ 'Q5398426' ], {}, { P2437: [ '+5' ], P1113: [ '+30' ] })),
        { seasonsCount: 5, episodesPerSeason: [ 6, 6, 6, 6, 6 ] },
    );
});

test('movie lookup reads per-season episode counts from season items', () => {
    const series = entity([ 'Q5398426' ], {}, { P2437: [ '+8' ], P1113: [ '+73' ] }, [
        { id: 's1', ordinal: 1 },
        { id: 's2', ordinal: 2 },
        { id: 's3', ordinal: 3 },
        { id: 's4', ordinal: 4 },
        { id: 's5', ordinal: 5 },
        { id: 's6', ordinal: 6 },
        { id: 's7', ordinal: 7 },
        { id: 's8', ordinal: 8 },
    ]);
    const parts = claimSeriesParts(series);

    assert.deepEqual(parts.map((part) => part.ordinal), [ 1, 2, 3, 4, 5, 6, 7, 8 ]);
    assert.deepEqual(
        claimSeriesInfo(series, parts.map((part, index) => ({
            ...part,
            entity: entity([ 'Q3464665' ], {}, { P1113: [ `+${index < 6 ? 10 : index === 6 ? 7 : 6}` ] }),
        }))),
        { seasonsCount: 8, episodesPerSeason: [ 10, 10, 10, 10, 10, 10, 7, 6 ] },
    );
});
