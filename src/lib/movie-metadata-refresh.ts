import type { MovieKind } from './movie-data';
import { normalizeGenreOptions, type GenreOption } from './genre-groups';
import { buildMovieDedupeKey } from './movie-dedupe';
import type {
    ExternalRatings,
    LookupProvider,
    MovieCastMember,
    MovieLookupCandidate,
    MovieLookupDetails,
    SeriesSeasonMetadata,
} from './movie-lookup-types';
import type { MovieVideoMetadata } from './movie-videos';
import {
    normalizeUsableSeriesMetadata,
    seriesSummaryWriteData,
} from './series-metadata';
import { toServedUploadUrl } from './upload-url';

export type MetadataMatchMovie = {
    kind: MovieKind;
    title: string;
    year: number;
};

export type MetadataCandidateSelection =
    | { status: 'matched'; candidate: MovieLookupCandidate }
    | { status: 'not-found' }
    | { status: 'ambiguous'; candidates: MovieLookupCandidate[] };

export type MovieMetadataRefreshRecord = MetadataMatchMovie & {
    id: string;
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

type KinopoiskProvider = Extract<LookupProvider, 'kinopoisk-dev' | 'kinopoisk-unofficial'>;

export type MovieMetadataRefreshPlan = {
    movie: {
        kind: MovieKind;
        title: string;
        year: number;
        country: string;
        description: string;
        posterUrl: string | null;
        trailerUrls: string[];
        watchLinks: string[];
        director: string | null;
        genres: GenreOption[] | string[];
        starring: string[];
        durationMin: number | null;
        seasonsCount: number | null;
        episodesPerSeason: number[];
        dedupeKey: string;
        metadataProvider: KinopoiskProvider;
        metadataExternalId: string;
        metadataUpdatedAt: Date;
    };
    seriesSeasons: SeriesSeasonMetadata[];
    externalRatings: ExternalRatings | undefined;
    cast: MovieCastMember[] | undefined;
    videos: MovieVideoMetadata[] | undefined;
};

export function normalizeMetadataTitle(value: string | null | undefined) {
    return (value ?? '')
        .normalize('NFKC')
        .toLocaleLowerCase('ru-RU')
        .replaceAll('ё', 'е')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

export function selectExactMetadataCandidate(
    movie: MetadataMatchMovie,
    candidates: readonly MovieLookupCandidate[],
): MetadataCandidateSelection {
    const title = normalizeMetadataTitle(movie.title);
    const exact = candidates.filter((candidate) =>
        candidate.externalId
        && candidate.provider !== 'wikidata'
        && candidate.kind === movie.kind
        && candidate.year === movie.year
        && [ candidate.title, candidate.originalTitle ]
            .some((value) => normalizeMetadataTitle(value) === title),
    );
    const ids = [ ...new Set(exact.map((candidate) => candidate.externalId!)) ];

    if (ids.length === 0) return { status: 'not-found' };
    if (ids.length > 1) {
        return {
            status: 'ambiguous',
            candidates: ids.map((id) => exact.find((candidate) => candidate.externalId === id)!),
        };
    }

    const sameId = exact.filter((candidate) => candidate.externalId === ids[0]);
    return {
        status: 'matched',
        candidate: sameId.find((candidate) => candidate.provider === 'kinopoisk-dev') ?? sameId[0]!,
    };
}

function nonEmptyText(value: string | null | undefined) {
    const normalized = value?.trim();
    return normalized || null;
}

function nonEmptyItems(values: readonly string[] | null | undefined) {
    const normalized = values?.map((value) => value.trim()).filter(Boolean) ?? [];
    return normalized.length > 0 ? [ ...new Set(normalized) ] : null;
}

export function isProtectedMoviePoster(url: string | null | undefined) {
    const servedUrl = toServedUploadUrl(url);
    return Boolean(
        servedUrl?.startsWith('/uploads/posters/')
        || servedUrl?.startsWith('/posters/'),
    );
}

function kinopoiskSource(details: MovieLookupDetails) {
    const externalId = details.externalId?.trim();
    if (
        !externalId
        || (details.provider !== 'kinopoisk-dev' && details.provider !== 'kinopoisk-unofficial')
    ) {
        throw new Error('Kinopoisk details must have a valid provider source');
    }

    return { provider: details.provider, externalId };
}

export function buildMovieMetadataRefreshPlan(
    current: MovieMetadataRefreshRecord,
    details: MovieLookupDetails,
    refreshedAt = new Date(),
): MovieMetadataRefreshPlan {
    if (details.kind !== current.kind) {
        throw new Error('Provider media kind does not match the stored movie');
    }

    const source = kinopoiskSource(details);
    const title = nonEmptyText(details.title) ?? current.title;
    const year = details.year ?? current.year;
    const genres = nonEmptyItems(details.genres);
    const starring = nonEmptyItems(details.starring);
    const seriesSeasons = current.kind === 'SERIES'
        ? normalizeUsableSeriesMetadata(details.seasons)
        : [];
    const summary = seriesSummaryWriteData({
        kind: current.kind,
        seasons: seriesSeasons,
        legacySeasonsCount: current.seasonsCount,
        legacyEpisodesPerSeason: current.episodesPerSeason,
    });

    return {
        movie: {
            kind: current.kind,
            title,
            year,
            country: nonEmptyText(details.country) ?? current.country,
            description: nonEmptyText(details.description) ?? current.description,
            posterUrl: isProtectedMoviePoster(current.posterUrl)
                ? current.posterUrl
                : nonEmptyText(details.posterUrl) ?? current.posterUrl,
            trailerUrls: [ ...current.trailerUrls ],
            watchLinks: [ ...current.watchLinks ],
            director: nonEmptyText(details.director) ?? current.director,
            genres: genres ? normalizeGenreOptions(genres) : [ ...current.genres ],
            starring: starring ?? [ ...current.starring ],
            durationMin: details.durationMin ?? current.durationMin,
            seasonsCount: summary.seasonsCount ?? current.seasonsCount,
            episodesPerSeason: summary.episodesPerSeason ?? [ ...current.episodesPerSeason ],
            dedupeKey: buildMovieDedupeKey({ kind: current.kind, title, year }),
            metadataProvider: source.provider,
            metadataExternalId: source.externalId,
            metadataUpdatedAt: refreshedAt,
        },
        seriesSeasons,
        externalRatings: details.externalRatings ?? undefined,
        cast: details.cast.length > 0 ? details.cast : undefined,
        videos: details.videos.length > 0 ? details.videos : undefined,
    };
}
