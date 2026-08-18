import type { GenreOption } from './genre-groups';

export const movieSortOptions = [ 'new', 'rating', 'year', 'title' ] as const;
export type MovieSort = (typeof movieSortOptions)[number];

export const movieSortDirOptions = [ 'asc', 'desc' ] as const;
export type MovieSortDir = (typeof movieSortDirOptions)[number];

export const movieKindOptions = [ 'MOVIE', 'SERIES', 'CARTOON' ] as const;
export type MovieKind = (typeof movieKindOptions)[number];

export type MovieCardData = {
    id: string;
    kind: MovieKind;
    title: string;
    year: number;
    country: string;
    genres: string[];
    posterUrl: string | null;
    seasonsCount: number | null;
    episodesPerSeason: number[];
    avgRating: number;
    ratingCount: number;
    commentCount: number;
};

export type MovieSearchQuery = {
    q?: string;
    sort?: MovieSort;
    dir?: MovieSortDir;
    kind?: MovieKind;
};

export type MovieSearchPage = {
    items: MovieCardData[];
    nextCursor: number | null;
    total: number;
};

export type HomeMovies = {
    latest: MovieCardData[];
};

export type MovieDetails = {
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
    createdAt: string;
    addedBy: string | null;
    avgRating: number;
    ratingCount: number;
    myRating: number | null;
    myWatchStatus: 'WATCHLIST' | 'WATCHED' | null;
    canEdit: boolean;
};

export type MovieFormFields = {
    kind?: MovieKind;
    title: string;
    year: number;
    country: string;
    description: string;
    posterUrl?: string;
    trailerUrls?: string[];
    watchLinks?: string[];
    director?: string;
    genres?: GenreOption[];
    starring?: string;
    durationMin?: number | '';
    seasonsCount?: number | '';
    episodesPerSeason?: string;
};
