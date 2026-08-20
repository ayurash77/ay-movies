import { useCallback, useEffect, useMemo } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';

import { PageTitle } from '@/components/AppTitle';
import { MovieCatalogControls } from '@/components/movies/MovieCatalogControls';
import { PaginatedMovieGallery } from '@/components/movies/PaginatedMovieGallery';
import { readCatalogPreferences, storeCatalogPreferences } from '@/lib/catalog-preferences';
import { movieSortDirOptions, movieSortOptions, type MovieSort, type MovieSortDir } from '@/lib/movie-data';
import { searchMovies } from '@/server/movies';

export const Route = createFileRoute('/')({
    validateSearch: z.object({
        q: z.string().optional(),
        sort: z.enum(movieSortOptions).optional(),
        dir: z.enum(movieSortDirOptions).optional(),
        genre: z.string().optional(),
    }),
    loaderDeps: ({ search }) => ({ q: search.q, sort: search.sort, dir: search.dir, genre: search.genre }),
    loader: async ({ deps }) => searchMovies({ data: deps }),
    component: HomePage,
});

function HomePage() {
    const page = Route.useLoaderData();
    const { q, sort, dir, genre } = Route.useSearch();
    const { user } = Route.useRouteContext();
    const navigate = useNavigate({ from: Route.fullPath });
    const preferenceScope = 'home';
    const selectedGenre = genre?.trim() || null;
    const genreCount = selectedGenre ? page.total : null;

    useEffect(() => {
        const preferences = readCatalogPreferences(user?.id ?? null, preferenceScope);
        const nextSort = sort ?? (preferences.sort === 'new' ? undefined : preferences.sort);
        const nextDir = dir ?? (preferences.dir === 'desc' ? undefined : preferences.dir);
        if (nextSort === sort && nextDir === dir) return;
        navigate({ search: (prev) => ({ ...prev, sort: nextSort, dir: nextDir }), replace: true });
    }, [ dir, navigate, sort, user?.id ]);

    const handleQueryChange = useCallback((nextQ: string | undefined) => {
        navigate({ search: (prev) => ({ ...prev, q: nextQ }), replace: true });
    }, [ navigate ]);

    const handleSortChange = useCallback((nextSort: MovieSort | undefined) => {
        storeCatalogPreferences(user?.id ?? null, preferenceScope, { sort: nextSort ?? 'new' });
        navigate({ search: (prev) => ({ ...prev, sort: nextSort }), replace: true });
    }, [ navigate, user?.id ]);

    const handleDirChange = useCallback((nextDir: MovieSortDir | undefined) => {
        storeCatalogPreferences(user?.id ?? null, preferenceScope, { dir: nextDir ?? 'desc' });
        navigate({ search: (prev) => ({ ...prev, dir: nextDir }), replace: true });
    }, [ navigate, user?.id ]);

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
                Фильмотека
            </button>
            <span className="shrink-0 text-muted-foreground">/</span>
            <span className="min-w-0 truncate text-primary">
                {selectedGenre} ({genreCount ?? 0})
            </span>
        </span>
    ) : undefined, [ genreCount, handleGenreChange, selectedGenre ]);

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
    const galleryQuery = useMemo(() => ({ q, sort, dir, genre }), [ dir, genre, q, sort ]);

    return (
        <div className="flex flex-col gap-6">
            <PageTitle title={selectedGenre ? `Фильмотека / ${selectedGenre}` : 'Фильмотека'} display={titleDisplay}/>
            <PaginatedMovieGallery
                initialPage={page}
                query={galleryQuery}
                emptyText={`Ничего не найдено${q ? ` по запросу «${q}»` : ''}`}
                controlsStart={controls}
                preferenceScope={preferenceScope}
                userId={user?.id ?? null}
                selectedGenre={selectedGenre}
                onSelectedGenreChange={handleGenreChange}
            />
        </div>
    );
}
