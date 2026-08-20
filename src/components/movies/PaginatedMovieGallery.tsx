import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import type { MovieSearchPage, MovieSearchQuery } from '@/lib/movie-data';
import { searchMovies } from '@/server/movies';

import { MovieGallery } from './MovieGallery';

type PaginatedMovieGalleryProps = {
    initialPage: MovieSearchPage;
    query: MovieSearchQuery;
    emptyText?: string;
    controlsStart?: ReactNode;
    controlsEnd?: ReactNode;
    preferenceScope?: string;
    userId?: string | null;
    selectedGenre?: string | null;
    onSelectedGenreChange?: (genre: string | null) => void;
    onGenreCountChange?: (count: number | null) => void;
};

export function PaginatedMovieGallery({
    initialPage,
    query,
    emptyText,
    controlsStart,
    controlsEnd,
    preferenceScope,
    userId,
    selectedGenre,
    onSelectedGenreChange,
    onGenreCountChange,
}: PaginatedMovieGalleryProps) {
    const [ page, setPage ] = useState(initialPage);
    const [ isLoadingMore, setIsLoadingMore ] = useState(false);
    const queryKey = `${query.q ?? ''}|${query.sort ?? ''}|${query.dir ?? ''}|${query.kind ?? ''}`;
    const queryKeyRef = useRef(queryKey);

    useEffect(() => {
        queryKeyRef.current = queryKey;
        setPage(initialPage);
        setIsLoadingMore(false);
    }, [ initialPage, queryKey ]);

    const handleLoadMore = useCallback(async () => {
        if (isLoadingMore || page.nextCursor === null) return;
        const requestQueryKey = queryKey;
        setIsLoadingMore(true);
        try {
            const next = await searchMovies({
                data: { ...query, cursor: page.nextCursor },
            });
            setPage((current) => {
                if (queryKeyRef.current !== requestQueryKey) return current;
                const existingIds = new Set(current.items.map((movie) => movie.id));
                const newItems = next.items.filter((movie) => !existingIds.has(movie.id));
                return {
                    items: [ ...current.items, ...newItems ],
                    nextCursor: next.nextCursor,
                    total: next.total,
                };
            });
        } catch {
            toast.error('Не удалось загрузить фильмы');
        } finally {
            setIsLoadingMore(false);
        }
    }, [ isLoadingMore, page.nextCursor, query, queryKey ]);

    const handleLoadCompleteSet = useCallback(async () => {
        if (isLoadingMore || page.nextCursor === null) return;
        const requestQueryKey = queryKey;
        let cursor: number | null = page.nextCursor;
        const loadedItems: MovieSearchPage['items'] = [];
        let total = page.total;

        setIsLoadingMore(true);
        try {
            while (cursor !== null) {
                const requestCursor: number = cursor;
                const nextPage: MovieSearchPage = await searchMovies({
                    data: { ...query, cursor: requestCursor },
                });
                if (queryKeyRef.current !== requestQueryKey) return;
                loadedItems.push(...nextPage.items);
                cursor = nextPage.nextCursor;
                total = nextPage.total;
            }

            setPage((current) => {
                if (queryKeyRef.current !== requestQueryKey) return current;
                const existingIds = new Set(current.items.map((movie) => movie.id));
                const newItems = loadedItems.filter((movie) => !existingIds.has(movie.id));
                return {
                    items: [ ...current.items, ...newItems ],
                    nextCursor: null,
                    total,
                };
            });
        } catch {
            toast.error('Не удалось загрузить фильмы');
        } finally {
            setIsLoadingMore(false);
        }
    }, [ isLoadingMore, page.nextCursor, page.total, query, queryKey ]);

    return (
        <div className="flex flex-col gap-5">
            <MovieGallery
                movies={page.items}
                emptyText={emptyText}
                controlsStart={controlsStart}
                controlsEnd={controlsEnd}
                onNeedCompleteSet={handleLoadCompleteSet}
                preferenceScope={preferenceScope}
                userId={userId}
                selectedGenre={selectedGenre}
                onSelectedGenreChange={onSelectedGenreChange}
                onGenreCountChange={onGenreCountChange}
            />
            {page.total > 0 ? (
                <div className="flex flex-col items-center gap-2">
                    <p className="text-xs text-muted-foreground">
                        Показано {page.items.length} из {page.total}
                    </p>
                    {page.nextCursor !== null ? (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleLoadMore}
                            disabled={isLoadingMore}
                        >
                            {isLoadingMore ? <Loader2 className="animate-spin"/> : null}
                            {isLoadingMore ? 'Загрузка…' : 'Показать ещё'}
                        </Button>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
