import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildLookupAttempts,
    claimSeriesInfo,
    claimYear,
    isMediaEntity,
    type LookupWikidataEntity,
} from '../src/lib/movie-lookup-utils';

function entity(
    ids: string[],
    dates: Record<string, string[]> = {},
    quantities: Record<string, string[]> = {},
): LookupWikidataEntity {
    return {
        claims: {
            P31: ids.map((id) => ({ mainsnak: { datavalue: { value: { id } } } })),
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
