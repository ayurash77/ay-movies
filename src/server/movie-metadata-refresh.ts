import type { PrismaClient } from '@prisma/client';

import {
    buildMovieMetadataRefreshPlan,
    selectExactMetadataCandidate,
    type MovieMetadataRefreshPlan,
    type MovieMetadataRefreshRecord,
} from '@/lib/movie-metadata-refresh';
import { resolveMovieLookupDetails } from '@/lib/movie-lookup-details';
import {
    lookupSourceSchema,
    type MovieLookupCandidate,
    type MovieLookupDetails,
} from '@/lib/movie-lookup-types';
import { seriesSnapshotWriteData } from '@/lib/series-metadata';
import { writeMovieRichMetadata } from './movie-rich-metadata';
import {
    loadKinopoiskCandidate,
    lookupKinopoiskCandidates,
} from './movie-lookup-providers/kinopoisk-dev';
import {
    loadKinopoiskUnofficialCandidate,
    loadKinopoiskUnofficialVideos,
    lookupKinopoiskUnofficialCandidates,
} from './movie-lookup-providers/kinopoisk-unofficial';

export type KinopoiskRefreshSource = {
    provider: 'kinopoisk-dev' | 'kinopoisk-unofficial';
    externalId: string;
};

export type MovieMetadataRefreshDependencies = {
    search(
        title: string,
        kind: MovieMetadataRefreshRecord['kind'],
    ): Promise<MovieLookupCandidate[]>;
    load(source: KinopoiskRefreshSource): Promise<MovieLookupDetails | null>;
};

export type MovieMetadataRefreshResolution =
    | { status: 'matched-by-id'; details: MovieLookupDetails }
    | { status: 'matched-by-search'; details: MovieLookupDetails }
    | { status: 'not-found' }
    | { status: 'ambiguous'; candidates: MovieLookupCandidate[] }
    | { status: 'failed'; reason: string };

export type PreparedMovieMetadataRefresh = {
    status: 'ready';
    plan: MovieMetadataRefreshPlan;
};

export type MovieMetadataRefreshPreparation =
    | PreparedMovieMetadataRefresh
    | { status: 'duplicate-conflict'; duplicateId: string };

function savedKinopoiskSource(movie: MovieMetadataRefreshRecord): KinopoiskRefreshSource | null {
    const source = lookupSourceSchema.safeParse({
        provider: movie.metadataProvider,
        externalId: movie.metadataExternalId,
    });
    if (!source.success || source.data.provider === 'wikidata') return null;
    return source.data;
}

async function searchKinopoisk(
    title: string,
    kind: MovieMetadataRefreshRecord['kind'],
) {
    const [ kinopoiskDev, kinopoiskUnofficial ] = await Promise.all([
        lookupKinopoiskCandidates(title, kind),
        lookupKinopoiskUnofficialCandidates(title, kind),
    ]);
    return [ ...kinopoiskDev, ...kinopoiskUnofficial ];
}

async function loadKinopoiskDetails(source: KinopoiskRefreshSource) {
    const loaders = source.provider === 'kinopoisk-unofficial'
        ? [ loadKinopoiskUnofficialCandidate, loadKinopoiskCandidate ]
        : [ loadKinopoiskCandidate, loadKinopoiskUnofficialCandidate ];
    const movie = await resolveMovieLookupDetails(source.externalId, loaders);
    if (!movie) return null;

    if (movie.videos.length > 0 || movie.provider === 'kinopoisk-unofficial') {
        return movie;
    }

    try {
        const videos = await loadKinopoiskUnofficialVideos(source.externalId);
        return { ...movie, videos };
    } catch {
        return movie;
    }
}

const productionDependencies: MovieMetadataRefreshDependencies = {
    search: searchKinopoisk,
    load: loadKinopoiskDetails,
};

function matchingDetails(
    movie: MovieMetadataRefreshRecord,
    details: MovieLookupDetails | null,
) {
    return details?.kind === movie.kind ? details : null;
}

export async function resolveMovieMetadataRefresh(
    movie: MovieMetadataRefreshRecord,
    dependencies: MovieMetadataRefreshDependencies = productionDependencies,
): Promise<MovieMetadataRefreshResolution> {
    try {
        const savedSource = savedKinopoiskSource(movie);
        if (savedSource) {
            const details = matchingDetails(movie, await dependencies.load(savedSource));
            return details
                ? { status: 'matched-by-id', details }
                : { status: 'failed', reason: 'saved-source-details-unavailable' };
        }

        const selection = selectExactMetadataCandidate(
            movie,
            await dependencies.search(movie.title, movie.kind),
        );
        if (selection.status !== 'matched') return selection;

        const details = matchingDetails(movie, await dependencies.load({
            provider: selection.candidate.provider as KinopoiskRefreshSource['provider'],
            externalId: selection.candidate.externalId!,
        }));
        return details
            ? { status: 'matched-by-search', details }
            : { status: 'failed', reason: 'candidate-details-unavailable' };
    } catch {
        return { status: 'failed', reason: 'provider-error' };
    }
}

export async function prepareMovieMetadataRefresh(
    db: PrismaClient,
    movie: MovieMetadataRefreshRecord,
    details: MovieLookupDetails,
): Promise<MovieMetadataRefreshPreparation> {
    const plan = buildMovieMetadataRefreshPlan(movie, details);
    const duplicate = await db.movie.findUnique({
        where: { dedupeKey: plan.movie.dedupeKey },
        select: { id: true },
    });
    if (duplicate && duplicate.id !== movie.id) {
        return { status: 'duplicate-conflict', duplicateId: duplicate.id };
    }

    return { status: 'ready', plan };
}

export async function applyMovieMetadataRefresh(
    db: PrismaClient,
    movie: MovieMetadataRefreshRecord,
    prepared: PreparedMovieMetadataRefresh,
) {
    const { plan } = prepared;
    await db.$transaction(async (tx) => {
        if (movie.kind !== 'SERIES') {
            await tx.seriesSeason.deleteMany({ where: { movieId: movie.id } });
            await tx.movie.update({
                where: { id: movie.id },
                data: plan.movie,
            });
        } else if (plan.seriesSeasons.length > 0) {
            await tx.seriesSeason.deleteMany({ where: { movieId: movie.id } });
            await tx.movie.update({
                where: { id: movie.id },
                data: {
                    ...plan.movie,
                    seriesSeasons: {
                        create: seriesSnapshotWriteData(plan.seriesSeasons),
                    },
                },
            });
        } else {
            await tx.movie.update({
                where: { id: movie.id },
                data: plan.movie,
            });
        }

        await writeMovieRichMetadata(tx, movie.id, {
            importSucceeded: true,
            externalRatings: plan.externalRatings,
            cast: plan.cast,
            videos: plan.videos,
        });
    });

    return { status: 'updated' as const };
}
