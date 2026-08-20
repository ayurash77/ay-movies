import type { MovieLookupDetails } from './movie-lookup-types';

export type MovieLookupDetailsLoader = (externalId: string) => Promise<MovieLookupDetails | null>;

function hasUsableDetails(movie: MovieLookupDetails) {
    return movie.kind !== 'SERIES' || movie.seasons.length > 0;
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
            if (movie && hasUsableDetails(movie)) return movie;
        } catch {
            // A failed provider must not prevent the next provider from loading details.
        }
    }

    return null;
}
