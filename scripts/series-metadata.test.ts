import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
    normalizeSeriesMetadata,
    metadataImportWriteData,
    seriesMetadataSummary,
    seriesSummaryWriteData,
    seriesSnapshotWriteData,
} from '../src/lib/series-metadata';
import {
    SERIES_METADATA_LIMITS,
    seriesMetadataSnapshotSchema,
} from '../src/lib/movie-lookup-types';

test('keeps source IDs separate from successful metadata import timestamps', () => {
    assert.deepEqual(metadataImportWriteData({
        kind: 'MOVIE',
        metadataProvider: 'kinopoisk-dev',
        metadataExternalId: '123',
        metadataImportSucceeded: false,
        hasDetailedSeriesSnapshot: false,
    }), {
        metadataProvider: 'kinopoisk-dev',
        metadataExternalId: '123',
        shouldUpdateMetadataTimestamp: false,
    });
    assert.deepEqual(metadataImportWriteData({
        kind: 'CARTOON',
        metadataProvider: 'kinopoisk-unofficial',
        metadataExternalId: '456',
        metadataImportSucceeded: true,
        hasDetailedSeriesSnapshot: false,
    }), {
        metadataProvider: 'kinopoisk-unofficial',
        metadataExternalId: '456',
        shouldUpdateMetadataTimestamp: true,
    });
    assert.deepEqual(metadataImportWriteData({
        kind: 'MOVIE',
        metadataProvider: 'kinopoisk-dev',
        metadataImportSucceeded: true,
        hasDetailedSeriesSnapshot: false,
    }), {
        metadataProvider: 'kinopoisk-dev',
        shouldUpdateMetadataTimestamp: false,
    });
    assert.deepEqual(metadataImportWriteData({
        kind: 'SERIES',
        metadataProvider: 'kinopoisk-dev',
        metadataExternalId: '789',
        metadataImportSucceeded: false,
        hasDetailedSeriesSnapshot: true,
    }), {
        metadataProvider: 'kinopoisk-dev',
        metadataExternalId: '789',
        shouldUpdateMetadataTimestamp: true,
    });
});

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

test('preserves existing series summary when an update has no detail or legacy summary input', () => {
    const snapshot = normalizeSeriesMetadata([
        { number: 1, episodes: [ { number: 1 }, { number: 2 } ] },
    ]);

    assert.deepEqual(seriesSummaryWriteData({
        kind: 'SERIES',
        seasons: [],
        preserveMissingLegacy: true,
    }), {});
    assert.deepEqual(seriesSummaryWriteData({
        kind: 'SERIES',
        seasons: [],
        legacySeasonsCount: null,
        legacyEpisodesPerSeason: [],
        preserveMissingLegacy: true,
    }), {
        seasonsCount: null,
        episodesPerSeason: [],
    });
    assert.deepEqual(seriesSummaryWriteData({
        kind: 'SERIES',
        seasons: snapshot,
        preserveMissingLegacy: true,
    }), {
        seasonsCount: 1,
        episodesPerSeason: [ 2 ],
    });
    assert.deepEqual(seriesSummaryWriteData({
        kind: 'MOVIE',
        seasons: snapshot,
        preserveMissingLegacy: true,
    }), {
        seasonsCount: null,
        episodesPerSeason: [],
    });
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

test('validates detailed snapshot limits at the shared boundary', () => {
    const episode = { number: SERIES_METADATA_LIMITS.maxEpisodeNumber, name: 'x'.repeat(SERIES_METADATA_LIMITS.maxTitleLength) };
    const season = {
        number: SERIES_METADATA_LIMITS.maxSeasonNumber,
        description: 'x'.repeat(SERIES_METADATA_LIMITS.maxDescriptionLength),
        episodes: Array.from({ length: SERIES_METADATA_LIMITS.maxEpisodesPerSeason }, (_, index) => ({
            ...episode,
            number: index + 1,
            stillUrl: 'https://example.test/image.jpg',
        })),
    };

    assert.doesNotThrow(() => seriesMetadataSnapshotSchema.parse([ season ]));
    assert.doesNotThrow(() => seriesMetadataSnapshotSchema.parse(Array.from(
        { length: 5 },
        (_, seasonIndex) => ({
            number: seasonIndex + 1,
            episodes: Array.from({ length: 1000 }, (_, episodeIndex) => ({ number: episodeIndex + 1 })),
        }),
    )));
    assert.throws(() => seriesMetadataSnapshotSchema.parse([ {
        number: 1,
        episodes: Array.from({ length: SERIES_METADATA_LIMITS.maxEpisodesPerSeason + 1 }, (_, index) => ({ number: index + 1 })),
    } ]));
    assert.throws(() => seriesMetadataSnapshotSchema.parse(Array.from(
        { length: 6 },
        (_, seasonIndex) => ({
            number: seasonIndex + 1,
            episodes: Array.from({ length: 1000 }, (_, episodeIndex) => ({ number: episodeIndex + 1 })),
        }),
    )));
    assert.throws(() => seriesMetadataSnapshotSchema.parse([ {
        number: 1,
        name: 'x'.repeat(SERIES_METADATA_LIMITS.maxTitleLength + 1),
        episodes: [ { number: 1 } ],
    } ]));
    assert.throws(() => seriesMetadataSnapshotSchema.parse([ {
        number: 1,
        description: 'x'.repeat(SERIES_METADATA_LIMITS.maxDescriptionLength + 1),
        episodes: [ { number: 1 } ],
    } ]));
    assert.throws(() => seriesMetadataSnapshotSchema.parse([ {
        number: 1,
        episodes: [ { number: 1, stillUrl: 'ftp://example.test/image.jpg' } ],
    } ]));
    assert.throws(() => seriesMetadataSnapshotSchema.parse([ {
        number: 1,
        posterUrl: `https://example.test/${'x'.repeat(SERIES_METADATA_LIMITS.maxUrlLength)}`,
        episodes: [ { number: 1 } ],
    } ]));
    assert.throws(() => seriesMetadataSnapshotSchema.parse([ {
        number: SERIES_METADATA_LIMITS.maxSeasonNumber + 1,
        episodes: [ { number: SERIES_METADATA_LIMITS.maxEpisodeNumber + 1 } ],
    } ]));
});
