import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeSeriesMetadata, seriesMetadataSummary } from '../src/lib/series-metadata';

test('normalizes and orders detailed seasons and episodes', () => {
    const seasons = normalizeSeriesMetadata([
        { number: 2, name: ' Второй ', episodes: [ { number: 2, name: 'B' }, { number: 1, name: ' A ' } ] },
        { number: 1, name: '', episodes: [ { number: 1, name: 'Pilot', airDate: '2022-04-01' } ] },
        { number: 0, episodes: [] },
        { number: 2, name: 'duplicate', episodes: [] },
    ]);

    assert.deepEqual(seasons.map((season) => season.number), [ 1, 2 ]);
    assert.deepEqual(seasons[1].episodes.map((episode) => episode.number), [ 1, 2 ]);
    assert.equal(seasons[0].name, null);
    assert.equal(seasons[0].episodes[0].airDate, '2022-04-01');
    assert.deepEqual(seriesMetadataSummary(seasons), {
        seasonsCount: 2,
        episodesPerSeason: [ 1, 2 ],
    });
});

test('rejects empty snapshots and invalid dates without throwing', () => {
    assert.deepEqual(normalizeSeriesMetadata([]), []);
    assert.equal(normalizeSeriesMetadata([
        { number: 1, episodes: [ { number: 1, airDate: 'not-a-date' } ] },
    ])[0].episodes[0].airDate, null);
});
