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
    mergeKinopoiskRefreshDetails,
    prepareMovieMetadataRefresh,
    resolveMovieMetadataRefresh,
} from '../src/server/movie-metadata-refresh';
import {
    parseMetadataRefreshArgs,
    runMovieMetadataRefresh,
} from './refresh-movie-metadata';

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

test('refresh plan preserves genres when provider genres do not map to standard options', () => {
    const plan = buildMovieMetadataRefreshPlan(
        movie({ genres: [ 'Драма' ] }),
        details({ genres: [ 'Мюзикл' ] }),
    );

    assert.deepEqual(plan.movie.genres, [ 'Драма' ]);
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

test('metadata refresh rejects a mismatched saved id and falls back to exact search', async () => {
    let searches = 0;
    const result = await resolveMovieMetadataRefresh(
        movie({ metadataProvider: 'kinopoisk-dev', metadataExternalId: '999' }),
        {
            search: async () => {
                searches += 1;
                return [ candidate({ externalId: '573209' }) ];
            },
            load: async (source) => source.externalId === '999'
                ? details({
                    title: 'Чужой фильм',
                    originalTitle: 'Different Movie',
                    externalId: '999',
                })
                : details({ externalId: '573209' }),
        },
    );

    assert.equal(searches, 1);
    assert.equal(result.status, 'matched-by-search');
    if (result.status === 'matched-by-search') {
        assert.equal(result.details.externalId, '573209');
    }
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

test('metadata refresh combines Unofficial base data with dev ratings and cast', () => {
    const automaticVideo = {
        provider: 'kinopoisk-unofficial' as const,
        site: 'YOUTUBE',
        title: 'Трейлер',
        kind: 'TRAILER' as const,
        url: 'https://www.youtube.com/watch?v=abcdefghi',
        thumbnailUrl: null,
        position: 0,
    };
    const castMember = {
        provider: 'kinopoisk-dev' as const,
        externalId: '123',
        name: 'Актёр',
        originalName: 'Actor',
        photoUrl: null,
        profession: 'actor' as const,
        role: 'Гонщик',
        order: 0,
    };
    const unofficial = details({
        provider: 'kinopoisk-unofficial',
        providerLabel: 'Кинопоиск Unofficial',
        description: 'Описание выбранного источника.',
        externalRatings: null,
        cast: [],
        videos: [ automaticVideo ],
    });
    const kinopoiskDev = details({
        provider: 'kinopoisk-dev',
        description: 'Описание другого источника.',
        externalRatings: {
            kinopoisk: { value: 8.2, votes: 1000 },
            imdb: null,
            russianCritics: null,
        },
        cast: [ castMember ],
        videos: [],
    });

    const merged = mergeKinopoiskRefreshDetails(unofficial, kinopoiskDev, unofficial);

    assert.equal(merged.provider, 'kinopoisk-unofficial');
    assert.equal(merged.description, 'Описание выбранного источника.');
    assert.deepEqual(merged.externalRatings, kinopoiskDev.externalRatings);
    assert.deepEqual(merged.cast, [ castMember ]);
    assert.deepEqual(merged.videos, [ automaticVideo ]);
});

function createPersistenceFake(duplicateId: string | null = null) {
    const calls = {
        transactions: 0,
        transactionTimeout: 0,
        seriesDeleteMany: 0,
        movieUpdate: 0,
        movieUpdateData: [] as Array<Record<string, unknown>>,
        posterUpdateMany: [] as Array<Record<string, unknown>>,
    };
    const tx = {
        seriesSeason: {
            deleteMany: async () => {
                calls.seriesDeleteMany += 1;
            },
        },
        movie: {
            update: async (args: { data: Record<string, unknown> }) => {
                calls.movieUpdate += 1;
                calls.movieUpdateData.push(args.data);
            },
            updateMany: async (args: Record<string, unknown>) => {
                calls.posterUpdateMany.push(args);
                return { count: 1 };
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
        $transaction: async <T>(
            run: (transaction: typeof tx) => Promise<T>,
            options?: { timeout?: number },
        ) => {
            calls.transactions += 1;
            calls.transactionTimeout = options?.timeout ?? 0;
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

test('metadata refresh apply never writes stale manual fields and conditionally replaces poster', async () => {
    const db = createPersistenceFake();
    const current = movie({
        posterUrl: 'https://old.example/poster.webp',
        trailerUrls: [ 'https://youtube.com/watch?v=manual' ],
        watchLinks: [ 'https://example.com/watch' ],
    });
    const prepared = await prepareMovieMetadataRefresh(
        db.client,
        current,
        details({ posterUrl: 'https://new.example/poster.webp' }),
    );
    assert.equal(prepared.status, 'ready');
    if (prepared.status !== 'ready') return;

    await applyMovieMetadataRefresh(db.client, current, prepared);

    const updateData = db.calls.movieUpdateData[0];
    assert.equal('trailerUrls' in updateData, false);
    assert.equal('watchLinks' in updateData, false);
    assert.equal('posterUrl' in updateData, false);
    assert.deepEqual(db.calls.posterUpdateMany, [ {
        where: { id: current.id, posterUrl: current.posterUrl },
        data: { posterUrl: 'https://new.example/poster.webp' },
    } ]);
    assert.equal(db.calls.transactionTimeout, 60_000);
});

test('metadata refresh CLI defaults to dry-run and parses filters', () => {
    assert.deepEqual(
        parseMetadataRefreshArgs([ '--limit=5', '--movie-id=abc', '--delay-ms=0' ]),
        {
            apply: false,
            limit: 5,
            movieId: 'abc',
            delayMs: 0,
        },
    );
    assert.equal(parseMetadataRefreshArgs([ '--apply' ]).apply, true);
});

test('metadata refresh CLI rejects invalid numeric arguments', () => {
    assert.throws(() => parseMetadataRefreshArgs([ '--limit=0' ]), /limit/);
    assert.throws(() => parseMetadataRefreshArgs([ '--delay-ms=-1' ]), /delay-ms/);
});

test('metadata refresh dry-run prepares every movie without writing', async () => {
    let applyCalls = 0;
    const first = movie();
    const dependencies = {
        listMovies: async () => [ first, movie({ id: 'second' }) ],
        resolve: async () => ({ status: 'matched-by-search' as const, details: details() }),
        prepare: async () => ({
            status: 'ready' as const,
            plan: buildMovieMetadataRefreshPlan(first, details()),
        }),
        apply: async () => {
            applyCalls += 1;
            return { status: 'updated' as const };
        },
        sleep: async () => {},
        log: () => {},
    };
    const report = await runMovieMetadataRefresh(
        { apply: false, limit: undefined, movieId: undefined, delayMs: 0 },
        dependencies,
    );

    assert.equal(applyCalls, 0);
    assert.equal(report.total, 2);
    assert.equal(report.ready, 2);
    assert.equal(report.updated, 0);
});

test('metadata refresh apply writes prepared movies and counts safe skips', async () => {
    let applyCalls = 0;
    const records = [ movie(), movie({ id: 'second' }), movie({ id: 'third' }) ];
    const dependencies = {
        listMovies: async () => records,
        resolve: async (record: RefreshMovieFixture) => record.id === 'third'
            ? { status: 'not-found' as const }
            : { status: 'matched-by-id' as const, details: details() },
        prepare: async (record: RefreshMovieFixture) => record.id === 'second'
            ? { status: 'duplicate-conflict' as const, duplicateId: 'canonical' }
            : {
                status: 'ready' as const,
                plan: buildMovieMetadataRefreshPlan(record, details()),
            },
        apply: async () => {
            applyCalls += 1;
            return { status: 'updated' as const };
        },
        sleep: async () => {},
        log: () => {},
    };
    const report = await runMovieMetadataRefresh(
        { apply: true, limit: undefined, movieId: undefined, delayMs: 0 },
        dependencies,
    );

    assert.equal(applyCalls, 1);
    assert.equal(report.updated, 1);
    assert.equal(report.duplicateConflict, 1);
    assert.equal(report.notFound, 1);
});
