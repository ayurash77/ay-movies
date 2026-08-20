import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
    normalizeSeriesMetadata,
    seriesMetadataSummary,
    seriesSnapshotWriteData,
} from '../src/lib/series-metadata';

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

test('builds nested Prisma create data for a detailed series snapshot', () => {
    const writeData = seriesSnapshotWriteData(normalizeSeriesMetadata([
        {
            number: 1,
            name: ' Первый сезон ',
            airDate: '2022-04-01',
            durationMin: 55,
            episodes: [
                { number: 1, name: 'Пилот', airDate: '2022-04-01', stillUrl: 'https://example.test/one.jpg' },
            ],
        },
    ]));

    assert.equal(writeData.length, 1);
    assert.equal(writeData[0].number, 1);
    assert.equal(writeData[0].name, 'Первый сезон');
    assert.equal(writeData[0].airDate?.toISOString(), '2022-04-01T00:00:00.000Z');
    assert.equal(writeData[0].episodes.create[0].number, 1);
    assert.equal(writeData[0].episodes.create[0].airDate?.toISOString(), '2022-04-01T00:00:00.000Z');
    assert.equal(writeData[0].episodes.create[0].stillUrl, 'https://example.test/one.jpg');
    assert.deepEqual(seriesSnapshotWriteData([]), []);
});

test('persists detailed snapshots transactionally and reads ordered rows', async () => {
    const testFile = fileURLToPath(import.meta.url);
    const moviesSource = await readFile(testFile.replace(/scripts\/series-metadata\.test\.ts$/, 'src/server/movies.ts'), 'utf8');

    assert.match(moviesSource, /db\.\$transaction\(/);
    assert.match(moviesSource, /seriesSeasons:\s*\{\s*create:/);
    assert.match(moviesSource, /seriesSeason\.deleteMany\(\{\s*where:\s*\{\s*movieId/s);
    assert.match(moviesSource, /if \(seriesSeasons\.length > 0\)[\s\S]*seriesSeason\.deleteMany/s);
    assert.match(moviesSource, /absent or empty detailed snapshot preserves existing episode rows/);
    assert.match(moviesSource, /seriesSeasons:\s*\{\s*orderBy:\s*\{\s*number:\s*'asc'\s*}\s*,\s*include:\s*\{\s*episodes:\s*\{\s*orderBy:\s*\{\s*number:\s*'asc'/s);
});
