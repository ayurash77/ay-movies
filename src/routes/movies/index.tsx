import { useCallback, useEffect, useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';

import { PageTitle } from '@/components/AppTitle';
import { MovieCatalogControls } from '@/components/movies/MovieCatalogControls';
import { PaginatedMovieGallery } from '@/components/movies/PaginatedMovieGallery';
import { readCatalogPreferences, storeCatalogPreferences } from '@/lib/catalog-preferences';
import {
    movieKindOptions,
    movieSortDirOptions,
    movieSortOptions,
    type MovieKind,
    type MovieSort,
    type MovieSortDir,
} from '@/lib/movie-data';
import {
    searchMovies,
} from '@/server/movies';

const KIND_TITLES: Record<MovieKind, string> = {
    MOVIE: 'Фильмы',
    SERIES: 'Сериалы',
    CARTOON: 'Мультфильмы',
};

export const Route = createFileRoute('/movies/')({
    validateSearch: z.object({
        q: z.string().optional(),
        sort: z.enum(movieSortOptions).optional(),
        dir: z.enum(movieSortDirOptions).optional(),
        kind: z.enum(movieKindOptions).optional(),
        genre: z.string().optional(),
    }),
    loaderDeps: ({ search }) => ({ q: search.q, sort: search.sort, dir: search.dir, kind: search.kind }),
    loader: async ({ deps }) => searchMovies({ data: deps }),
    component: MoviesPage,
});

function MoviesPage() {
    const page = Route.useLoaderData();
    const { q, sort, dir, kind, genre } = Route.useSearch();
    const { user } = Route.useRouteContext();
    const navigate = useNavigate({ from: Route.fullPath });
    const title = kind ? KIND_TITLES[kind] : 'Все фильмы';
    const [ genreCount, setGenreCount ] = useState<number | null>(null);
    const preferenceScope = `movies:${kind ?? 'all'}`;
    const selectedGenre = genre?.trim() || null;

    useEffect(() => {
        setGenreCount(null);
    }, [ selectedGenre ]);

    useEffect(() => {
        const preferences = readCatalogPreferences(user?.id ?? null, preferenceScope);
        const nextSort = sort ?? (preferences.sort === 'new' ? undefined : preferences.sort);
        const nextDir = dir ?? (preferences.dir === 'desc' ? undefined : preferences.dir);
        if (nextSort === sort && nextDir === dir) return;
        navigate({ search: (prev) => ({ ...prev, sort: nextSort, dir: nextDir }), replace: true });
    }, [ dir, navigate, preferenceScope, sort, user?.id ]);

    const handleQueryChange = useCallback((nextQ: string | undefined) => {
        navigate({ search: (prev) => ({ ...prev, q: nextQ }), replace: true });
    }, [ navigate ]);

    const handleSortChange = useCallback((nextSort: MovieSort | undefined) => {
        storeCatalogPreferences(user?.id ?? null, preferenceScope, { sort: nextSort ?? 'new' });
        navigate({ search: (prev) => ({ ...prev, sort: nextSort }), replace: true });
    }, [ navigate, preferenceScope, user?.id ]);

    const handleDirChange = useCallback((nextDir: MovieSortDir | undefined) => {
        storeCatalogPreferences(user?.id ?? null, preferenceScope, { dir: nextDir ?? 'desc' });
        navigate({ search: (prev) => ({ ...prev, dir: nextDir }), replace: true });
    }, [ navigate, preferenceScope, user?.id ]);

    const handleGenreChange = useCallback((nextGenre: string | null) => {
        navigate({ search: (prev) => ({ ...prev, genre: nextGenre ?? undefined }), replace: false });
    }, [ navigate ]);

    const titleDisplay = useMemo(() => selectedGenre ? (
        <span className="flex min-w-0 items-baseline gap-2">
            <button
                type="button"
                className="shrink-0 text-foreground transition-colors hover:text-primary"
                onClick={() => handleGenreChange(null)}
            >
                {title}
            </button>
            <span className="shrink-0 text-muted-foreground">/</span>
            <span className="min-w-0 truncate text-primary">
                {selectedGenre} ({genreCount ?? '...'})
            </span>
        </span>
    ) : undefined, [ genreCount, handleGenreChange, selectedGenre, title ]);

    const controls = useMemo(() => (
        <MovieCatalogControls
            q={q}
            sort={sort}
            dir={dir}
            onQueryChange={handleQueryChange}
            onSortChange={handleSortChange}
            onDirChange={handleDirChange}
        />
    ), [ dir, handleDirChange, handleQueryChange, handleSortChange, q, sort ]);
    const galleryQuery = useMemo(() => ({ q, sort, dir, kind }), [ dir, kind, q, sort ]);

    return (
        <div className="flex flex-col gap-6">
            <PageTitle title={selectedGenre ? `${title} / ${selectedGenre}` : title} display={titleDisplay}/>

            <PaginatedMovieGallery
                initialPage={page}
                query={galleryQuery}
                emptyText={`Ничего не найдено${q ? ` по запросу «${q}»` : ''}`}
                controlsStart={controls}
                preferenceScope={preferenceScope}
                userId={user?.id ?? null}
                selectedGenre={selectedGenre}
                onSelectedGenreChange={handleGenreChange}
                onGenreCountChange={setGenreCount}
            />
        </div>
    );
}
