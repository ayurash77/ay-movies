import type {
    ExternalRatings,
    MovieCastMember,
    MovieLookupCandidate,
    MovieLookupDetails,
    SeriesSeasonMetadata,
} from './movie-lookup-types';
import type { MovieVideoMetadata } from './movie-videos';
import { normalizeUsableSeriesMetadata } from './series-metadata';

export type MovieLookupDetailsLoader = (externalId: string) => Promise<MovieLookupDetails | null>;

export function hasUsableMovieLookupDetails(movie: MovieLookupDetails) {
    if (movie.kind !== 'SERIES') return true;

    return normalizeUsableSeriesMetadata(movie.seasons).length > 0;
}

type FormMetadataSnapshot = {
    seriesSeasons?: SeriesSeasonMetadata[];
    externalRatings?: ExternalRatings;
    cast?: MovieCastMember[];
    videos?: MovieVideoMetadata[];
};

export function movieLookupFormMetadata(
    candidate: MovieLookupCandidate | MovieLookupDetails,
    current: FormMetadataSnapshot = {},
): FormMetadataSnapshot & { metadataImportSucceeded: boolean } {
    if (!('seasons' in candidate) || !hasUsableMovieLookupDetails(candidate)) {
        return {
            metadataImportSucceeded: false,
            seriesSeasons: current.seriesSeasons,
            externalRatings: current.externalRatings,
            cast: current.cast,
            videos: current.videos,
        };
    }

    return {
        metadataImportSucceeded: true,
        seriesSeasons: candidate.kind === 'SERIES'
            ? normalizeUsableSeriesMetadata(candidate.seasons)
            : undefined,
        externalRatings: candidate.externalRatings ?? undefined,
        cast: candidate.cast,
        videos: candidate.videos,
    };
}

/**
 * Runs the user-selected provider first. A series without episodes is only a
 * partial response, so another Kinopoisk provider gets a chance to fill it.
 */
export async function resolveMovieLookupDetails(
    externalId: string,
    loaders: readonly MovieLookupDetailsLoader[],
): Promise<MovieLookupDetails | null> {
    for (const load of loaders) {
        try {
            const movie = await load(externalId);
            if (movie && hasUsableMovieLookupDetails(movie)) return movie;
        } catch {
            // A failed provider must not prevent the next provider from loading details.
        }
    }

    return null;
}
