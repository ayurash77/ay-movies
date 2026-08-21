import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PrismaClient, type Prisma } from '@prisma/client';

import type { MovieMetadataRefreshRecord } from '../src/lib/movie-metadata-refresh';
import type { MovieLookupDetails } from '../src/lib/movie-lookup-types';
import {
    applyMovieMetadataRefresh,
    prepareMovieMetadataRefresh,
    resolveMovieMetadataRefresh,
    type MovieMetadataRefreshPreparation,
    type MovieMetadataRefreshResolution,
    type PreparedMovieMetadataRefresh,
} from '../src/server/movie-metadata-refresh';
import { isMovieLookupQuotaError } from '../src/server/movie-lookup-provider-errors';

export type MetadataRefreshOptions = {
    apply: boolean;
    limit?: number;
    movieId?: string;
    delayMs: number;
};

export type MetadataRefreshReport = {
    total: number;
    ready: number;
    matchedById: number;
    matchedBySearch: number;
    updated: number;
    notFound: number;
    ambiguous: number;
    duplicateConflict: number;
    failed: number;
};

export type MetadataRefreshRunnerDependencies = {
    listMovies(options: MetadataRefreshOptions): Promise<MovieMetadataRefreshRecord[]>;
    resolve(movie: MovieMetadataRefreshRecord): Promise<MovieMetadataRefreshResolution>;
    prepare(
        movie: MovieMetadataRefreshRecord,
        details: MovieLookupDetails,
    ): Promise<MovieMetadataRefreshPreparation>;
    apply(
        movie: MovieMetadataRefreshRecord,
        prepared: PreparedMovieMetadataRefresh,
    ): Promise<{ status: 'updated' }>;
    sleep(delayMs: number): Promise<void>;
    log(message: string): void;
};

function integerArgument(name: string, value: string | undefined, minimum: number) {
    if (value === undefined) return undefined;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < minimum) {
        throw new Error(`--${name} must be an integer >= ${minimum}`);
    }
    return parsed;
}

export function parseMetadataRefreshArgs(argv: string[]): MetadataRefreshOptions {
    const { values } = parseArgs({
        args: argv.filter((argument) => argument !== '--'),
        allowPositionals: false,
        strict: true,
        options: {
            apply: { type: 'boolean', default: false },
            limit: { type: 'string' },
            'movie-id': { type: 'string' },
            'delay-ms': { type: 'string' },
        },
    });
    const movieId = values['movie-id']?.trim();
    if (values['movie-id'] !== undefined && !movieId) {
        throw new Error('--movie-id must not be empty');
    }

    return {
        apply: values.apply ?? false,
        limit: integerArgument('limit', values.limit, 1),
        movieId,
        delayMs: integerArgument('delay-ms', values['delay-ms'], 0) ?? 1000,
    };
}

function emptyReport(): MetadataRefreshReport {
    return {
        total: 0,
        ready: 0,
        matchedById: 0,
        matchedBySearch: 0,
        updated: 0,
        notFound: 0,
        ambiguous: 0,
        duplicateConflict: 0,
        failed: 0,
    };
}

function movieLabel(movie: MovieMetadataRefreshRecord) {
    const title = movie.title.replace(/\s+/g, ' ').trim().slice(0, 200);
    return `${movie.id} ${title} (${movie.year})`;
}

function resolutionDetails(resolution: MovieMetadataRefreshResolution) {
    return resolution.status === 'matched-by-id' || resolution.status === 'matched-by-search'
        ? resolution.details
        : null;
}

export async function runMovieMetadataRefresh(
    options: MetadataRefreshOptions,
    dependencies: MetadataRefreshRunnerDependencies,
): Promise<MetadataRefreshReport> {
    const movies = await dependencies.listMovies(options);
    const report = emptyReport();
    dependencies.log(`mode: ${options.apply ? 'apply' : 'dry-run'}`);
    dependencies.log(`selected movies: ${movies.length}`);

    for (const [ index, movie ] of movies.entries()) {
        report.total += 1;
        const label = movieLabel(movie);
        try {
            const resolution = await dependencies.resolve(movie);
            if (resolution.status === 'not-found') {
                report.notFound += 1;
                dependencies.log(`not-found: ${label}`);
                continue;
            }
            if (resolution.status === 'ambiguous') {
                report.ambiguous += 1;
                const ids = resolution.candidates.map((candidate) => candidate.externalId).join(',');
                dependencies.log(`ambiguous: ${label}; candidates=${ids}`);
                continue;
            }
            if (resolution.status === 'failed') {
                report.failed += 1;
                dependencies.log(`failed: ${label}; reason=${resolution.reason}`);
                continue;
            }

            if (resolution.status === 'matched-by-id') report.matchedById += 1;
            if (resolution.status === 'matched-by-search') report.matchedBySearch += 1;
            const details = resolutionDetails(resolution)!;
            const prepared = await dependencies.prepare(movie, details);
            if (prepared.status === 'duplicate-conflict') {
                report.duplicateConflict += 1;
                dependencies.log(`duplicate-conflict: ${label}; duplicate=${prepared.duplicateId}`);
                continue;
            }

            report.ready += 1;
            if (!options.apply) {
                dependencies.log(`ready: ${label}; source=${details.provider}:${details.externalId}`);
                continue;
            }

            await dependencies.apply(movie, prepared);
            report.updated += 1;
            dependencies.log(`updated: ${label}; source=${details.provider}:${details.externalId}`);
        } catch (error) {
            if (isMovieLookupQuotaError(error)) {
                dependencies.log(
                    `quota-exhausted: provider=${error.provider}; status=${error.status}; stopped-after=${report.total}`,
                );
                throw error;
            }
            report.failed += 1;
            const reason = error instanceof Error
                ? `runtime-${error.name.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()}`
                : 'unknown-error';
            dependencies.log(`failed: ${label}; reason=${reason}`);
        } finally {
            if (options.delayMs > 0 && index < movies.length - 1) {
                await dependencies.sleep(options.delayMs);
            }
        }
    }

    dependencies.log(`report: ${JSON.stringify(report)}`);
    return report;
}

const movieSelect = {
    id: true,
    kind: true,
    title: true,
    year: true,
    country: true,
    description: true,
    posterUrl: true,
    trailerUrls: true,
    watchLinks: true,
    director: true,
    genres: true,
    starring: true,
    durationMin: true,
    seasonsCount: true,
    episodesPerSeason: true,
    metadataProvider: true,
    metadataExternalId: true,
} as const;

type StoredMovieMetadataRefreshRecord = Prisma.MovieGetPayload<{ select: typeof movieSelect }>;

function createProductionDependencies(db: PrismaClient): MetadataRefreshRunnerDependencies {
    return {
        listMovies: async (options) => {
            const movies: StoredMovieMetadataRefreshRecord[] = await db.movie.findMany({
                where: options.movieId ? { id: options.movieId } : undefined,
                orderBy: [ { createdAt: 'asc' }, { id: 'asc' } ],
                ...(options.limit ? { take: options.limit } : {}),
                select: movieSelect,
            });
            return movies;
        },
        resolve: resolveMovieMetadataRefresh,
        prepare: (movie, details) => prepareMovieMetadataRefresh(db, movie, details),
        apply: (movie, prepared) => applyMovieMetadataRefresh(db, movie, prepared),
        sleep: (delayMs) => new Promise((complete) => setTimeout(complete, delayMs)),
        log: (message) => console.log(message),
    };
}

async function main() {
    const options = parseMetadataRefreshArgs(process.argv.slice(2));
    const db = new PrismaClient();
    try {
        await runMovieMetadataRefresh(options, createProductionDependencies(db));
    } finally {
        await db.$disconnect();
    }
}

const isDirectExecution = process.argv[1]
    ? pathToFileURL(resolve(process.argv[1])).href === import.meta.url
    : false;

if (isDirectExecution) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
