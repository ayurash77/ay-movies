import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';

import {
    buildMovieMetadataRefreshPlan,
    normalizeMetadataTitle,
    selectExactMetadataCandidate,
} from '../src/lib/movie-metadata-refresh';
import type { MovieKind } from '../src/lib/movie-data';
import type {
    MovieLookupCandidate,
    MovieLookupDetails,
    SeriesSeasonMetadata,
} from '../src/lib/movie-lookup-types';
import {
    applyMovieMetadataRefresh,
    prepareMovieMetadataRefresh,
    resolveMovieMetadataRefresh,
} from '../src/server/movie-metadata-refresh';

const usableSeasons: SeriesSeasonMetadata[] = [ {
    number: 1,
    name: 'Сезон 1',
    originalName: 'Season 1',
    description: null,
    originalDescription: null,
    airDate: '2010-01-01',
    durationMin: 100,
    posterUrl: null,
    episodes: [
        { number: 1, name: 'Серия 1', originalName: 'Episode 1', description: null, originalDescription: null, airDate: '2010-01-01', stillUrl: null },
        { number: 2, name: 'Серия 2', originalName: 'Episode 2', description: null, originalDescription: null, airDate: '2010-01-08', stillUrl: null },
    ],
} ];

function candidate(overrides: Partial<MovieLookupCandidate> = {}): MovieLookupCandidate {
    return {
        found: true,
        kind: 'MOVIE',
        title: 'Сенна',
        originalTitle: 'Senna',
        year: 2010,
        country: 'Великобритания',
        description: 'Документальный фильм.',
        director: 'Азиф Кападиа',
        genres: [ 'документальный', 'спорт' ],
        starring: [],
        durationMin: 106,
        seasonsCount: null,
        episodesPerSeason: null,
        posterUrl: 'https://image.openmoviedb.com/poster.webp',
        provider: 'kinopoisk-dev',
        providerLabel: 'Кинопоиск',
        externalId: '573209',
        sourceUrl: 'https://www.kinopoisk.ru/film/573209/',
        rating: 8.2,
        confidence: 100,
        ...overrides,
    };
}

type RefreshMovieFixture = {
    id: string;
    kind: MovieKind;
    title: string;
    year: number;
    country: string;
    description: string;
    posterUrl: string | null;
    trailerUrls: string[];
    watchLinks: string[];
    director: string | null;
    genres: string[];
    starring: string[];
    durationMin: number | null;
    seasonsCount: number | null;
    episodesPerSeason: number[];
    metadataProvider: string | null;
    metadataExternalId: string | null;
};

function movie(overrides: Partial<RefreshMovieFixture> = {}): RefreshMovieFixture {
    return {
        id: 'movie-1',
        kind: 'MOVIE',
        title: 'Сенна',
        year: 2010,
        country: 'Великобритания',
        description: 'Старое описание.',
        posterUrl: null,
        trailerUrls: [],
        watchLinks: [],
        director: null,
        genres: [],
        starring: [],
        durationMin: null,
        seasonsCount: null,
        episodesPerSeason: [],
        metadataProvider: null,
        metadataExternalId: null,
        ...overrides,
    };
}

function details(overrides: Partial<MovieLookupDetails> = {}): MovieLookupDetails {
    return {
        ...candidate(),
        seasons: [],
        externalRatings: null,
        cast: [],
        videos: [],
        ...overrides,
    };
}

test('normalizes case, punctuation and yo for exact title matching', () => {
    assert.equal(normalizeMetadataTitle('  Форд против Феррари! '), 'форд против феррари');
    assert.equal(normalizeMetadataTitle('Всё о Еве'), 'все о еве');
});

test('selects one exact Kinopoisk id across provider duplicates', () => {
    const result = selectExactMetadataCandidate(
        { kind: 'MOVIE', title: 'Сенна', year: 2010 },
        [
            candidate({ provider: 'kinopoisk-dev', externalId: '573209' }),
            candidate({ provider: 'kinopoisk-unofficial', externalId: '573209' }),
        ],
    );

    assert.equal(result.status, 'matched');
    if (result.status === 'matched') {
        assert.equal(result.candidate.provider, 'kinopoisk-dev');
    }
});

test('accepts an exact original title match', () => {
    const result = selectExactMetadataCandidate(
        { kind: 'SERIES', title: 'Slow Horses', year: 2022 },
        [ candidate({ kind: 'SERIES', title: 'Медленные лошади', originalTitle: 'Slow Horses', year: 2022 }) ],
    );

    assert.equal(result.status, 'matched');
});

test('rejects year and kind mismatches', () => {
    assert.equal(selectExactMetadataCandidate(
        { kind: 'MOVIE', title: 'Сенна', year: 2010 },
        [ candidate({ year: 2011 }) ],
    ).status, 'not-found');

    assert.equal(selectExactMetadataCandidate(
        { kind: 'MOVIE', title: 'Сенна', year: 2010 },
        [ candidate({ kind: 'SERIES' }) ],
    ).status, 'not-found');
});

test('reports different exact Kinopoisk ids as ambiguous', () => {
    const result = selectExactMetadataCandidate(
        { kind: 'MOVIE', title: 'Сенна', year: 2010 },
        [ candidate({ externalId: '1' }), candidate({ externalId: '2' }) ],
    );

    assert.equal(result.status, 'ambiguous');
});

test('refresh plan preserves uploaded poster and manual links', () => {
    const plan = buildMovieMetadataRefreshPlan(
        movie({
            posterUrl: '/uploads/posters/user.webp',
            trailerUrls: [ 'https://youtube.com/watch?v=manual' ],
            watchLinks: [ 'https://example.com/watch' ],
        }),
        details({ posterUrl: 'https://image.openmoviedb.com/provider.webp' }),
        new Date('2026-08-21T10:00:00.000Z'),
    );

    assert.equal(plan.movie.posterUrl, '/uploads/posters/user.webp');
    assert.deepEqual(plan.movie.trailerUrls, [ 'https://youtube.com/watch?v=manual' ]);
    assert.deepEqual(plan.movie.watchLinks, [ 'https://example.com/watch' ]);
});

test('refresh plan recognizes legacy direct S3 upload urls as protected', () => {
    const plan = buildMovieMetadataRefreshPlan(
        movie({ posterUrl: 'https://s3.twcstorage.ru/ay-s3storage-01/posters/user.webp' }),
        details({ posterUrl: 'https://image.openmoviedb.com/provider.webp' }),
    );

    assert.equal(plan.movie.posterUrl, 'https://s3.twcstorage.ru/ay-s3storage-01/posters/user.webp');
});

test('refresh plan replaces external poster and provider-owned fields', () => {
    const plan = buildMovieMetadataRefreshPlan(
        movie({ posterUrl: 'https://old.example/poster.webp' }),
        details({
            title: 'Сенна',
            country: 'Великобритания, Франция',
            description: 'Новое описание.',
            director: 'Азиф Кападиа',
            genres: [ 'Драматический фильм', 'Спортивный фильм' ],
            starring: [ 'Айртон Сенна' ],
            durationMin: 106,
            posterUrl: 'https://new.example/poster.webp',
        }),
    );

    assert.equal(plan.movie.posterUrl, 'https://new.example/poster.webp');
    assert.equal(plan.movie.description, 'Новое описание.');
    assert.deepEqual(plan.movie.genres, [ 'Драма', 'Спорт' ]);
    assert.deepEqual(plan.movie.starring, [ 'Айртон Сенна' ]);
    assert.equal(plan.movie.metadataExternalId, '573209');
});

test('refresh plan builds a detailed series snapshot and summary', () => {
    const plan = buildMovieMetadataRefreshPlan(
        movie({
            kind: 'SERIES',
            seasonsCount: 4,
            episodesPerSeason: [ 8, 8, 8, 8 ],
        }),
        details({
            kind: 'SERIES',
            seasons: usableSeasons,
            seasonsCount: 1,
            episodesPerSeason: [ 2 ],
        }),
    );

    assert.equal(plan.seriesSeasons.length, 1);
    assert.equal(plan.movie.seasonsCount, 1);
    assert.deepEqual(plan.movie.episodesPerSeason, [ 2 ]);
});

test('refresh plan preserves existing series summary when details have no episodes', () => {
    const plan = buildMovieMetadataRefreshPlan(
        movie({
            kind: 'SERIES',
            seasonsCount: 4,
            episodesPerSeason: [ 8, 8, 8, 8 ],
        }),
        details({ kind: 'SERIES', seasons: [] }),
    );

    assert.equal(plan.seriesSeasons.length, 0);
    assert.equal(plan.movie.seasonsCount, 4);
    assert.deepEqual(plan.movie.episodesPerSeason, [ 8, 8, 8, 8 ]);
});

test('metadata refresh loads a saved Kinopoisk id without title search', async () => {
    let searches = 0;
    const result = await resolveMovieMetadataRefresh(
        movie({ metadataProvider: 'kinopoisk-dev', metadataExternalId: '573209' }),
        {
            search: async () => {
                searches += 1;
                return [];
            },
            load: async () => details({ externalId: '573209' }),
        },
    );

    assert.equal(searches, 0);
    assert.equal(result.status, 'matched-by-id');
});

test('metadata refresh searches records without a Kinopoisk id', async () => {
    let loadedId = '';
    const result = await resolveMovieMetadataRefresh(movie(), {
        search: async () => [ candidate() ],
        load: async (source) => {
            loadedId = source.externalId;
            return details();
        },
    });

    assert.equal(result.status, 'matched-by-search');
    assert.equal(loadedId, '573209');
});

test('metadata refresh preserves ambiguous search result without loading details', async () => {
    let loads = 0;
    const result = await resolveMovieMetadataRefresh(movie(), {
        search: async () => [ candidate({ externalId: '1' }), candidate({ externalId: '2' }) ],
        load: async () => {
            loads += 1;
            return details();
        },
    });

    assert.equal(result.status, 'ambiguous');
    assert.equal(loads, 0);
});

test('metadata refresh reports provider failures without throwing', async () => {
    const result = await resolveMovieMetadataRefresh(movie(), {
        search: async () => {
            throw new Error('provider unavailable');
        },
        load: async () => details(),
    });

    assert.deepEqual(result, { status: 'failed', reason: 'provider-error' });
});

function createPersistenceFake(duplicateId: string | null = null) {
    const calls = { transactions: 0, seriesDeleteMany: 0, movieUpdate: 0 };
    const tx = {
        seriesSeason: {
            deleteMany: async () => {
                calls.seriesDeleteMany += 1;
            },
        },
        movie: {
            update: async () => {
                calls.movieUpdate += 1;
            },
        },
        person: { upsert: async () => ({ id: 'person-1' }) },
        moviePersonCredit: { deleteMany: async () => {}, createMany: async () => {} },
        movieVideo: { deleteMany: async () => {}, createMany: async () => {} },
    };
    const client = {
        movie: {
            findUnique: async () => duplicateId ? { id: duplicateId } : null,
        },
        $transaction: async <T>(run: (transaction: typeof tx) => Promise<T>) => {
            calls.transactions += 1;
            return run(tx);
        },
    } as unknown as PrismaClient;

    return { calls, client };
}

test('metadata refresh preparation reports a dedupe conflict before a transaction', async () => {
    const db = createPersistenceFake('other');
    const result = await prepareMovieMetadataRefresh(db.client, movie(), details());

    assert.deepEqual(result, { status: 'duplicate-conflict', duplicateId: 'other' });
    assert.equal(db.calls.transactions, 0);
});

test('metadata refresh apply replaces a non-empty series snapshot transactionally', async () => {
    const db = createPersistenceFake();
    const current = movie({
        kind: 'SERIES',
        seasonsCount: 4,
        episodesPerSeason: [ 8, 8, 8, 8 ],
    });
    const refreshed = details({
        kind: 'SERIES',
        seasons: usableSeasons,
        seasonsCount: 1,
        episodesPerSeason: [ 2 ],
    });
    const prepared = await prepareMovieMetadataRefresh(db.client, current, refreshed);

    assert.equal(prepared.status, 'ready');
    if (prepared.status !== 'ready') return;

    const result = await applyMovieMetadataRefresh(db.client, current, prepared);

    assert.deepEqual(result, { status: 'updated' });
    assert.equal(db.calls.transactions, 1);
    assert.equal(db.calls.seriesDeleteMany, 1);
    assert.equal(db.calls.movieUpdate, 1);
});
