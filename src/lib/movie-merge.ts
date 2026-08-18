import { normalizeGenre } from './genre-groups';

export type MergeableMovie = {
    id: string;
    kind: string;
    title: string;
    year: number;
    country: string;
    description: string;
    posterUrl: string | null;
    trailerUrls: string[];
    watchLinks: string[];
    director: string | null;
    genres: string[];
    durationMin: number | null;
    seasonsCount: number | null;
    episodesPerSeason: number[];
    starring: string[];
    createdAt: Date;
};

function uniqueItems(items: string[]) {
    return [ ...new Set(items.map((item) => item.trim()).filter(Boolean)) ];
}

function firstPresent<T>(items: Array<T | null | undefined>) {
    return items.find((item): item is T => item !== null && item !== undefined);
}

export function chooseCanonicalMovie<T extends Pick<MergeableMovie, 'id' | 'createdAt'>>(movies: T[]) {
    return [ ...movies ].sort((a, b) => {
        const timeDiff = a.createdAt.getTime() - b.createdAt.getTime();
        return timeDiff || a.id.localeCompare(b.id);
    })[0];
}

export function normalizeStoredGenres(genres: string[]) {
    return uniqueItems(genres.map(normalizeGenre));
}

export function mergeMovieFields(canonical: MergeableMovie, duplicates: MergeableMovie[]) {
    const movies = [ canonical, ...duplicates ];
    const bestDescription = [ ...movies ]
        .map((movie) => movie.description.trim())
        .filter(Boolean)
        .sort((a, b) => b.length - a.length)[0] ?? canonical.description;

    return {
        country: canonical.country,
        description: bestDescription,
        posterUrl: firstPresent(movies.map((movie) => movie.posterUrl)) ?? null,
        trailerUrls: uniqueItems(movies.flatMap((movie) => movie.trailerUrls)),
        watchLinks: uniqueItems(movies.flatMap((movie) => movie.watchLinks)),
        director: firstPresent(movies.map((movie) => movie.director)) ?? null,
        genres: normalizeStoredGenres(movies.flatMap((movie) => movie.genres)),
        durationMin: firstPresent(movies.map((movie) => movie.durationMin)) ?? null,
        seasonsCount: firstPresent(movies.map((movie) => movie.seasonsCount)) ?? null,
        episodesPerSeason: firstPresent(movies.map((movie) =>
            movie.episodesPerSeason.length ? movie.episodesPerSeason : null,
        )) ?? [],
        starring: uniqueItems(movies.flatMap((movie) => movie.starring)),
    };
}
