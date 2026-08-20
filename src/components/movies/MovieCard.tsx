import { Link, useLocation } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { MessageSquare } from 'lucide-react';
import { IoFilm } from 'react-icons/io5';
import { TbDeviceTvOldFilled } from 'react-icons/tb';
import { FaImage } from 'react-icons/fa6';

import type { MovieCardData, MovieKind } from '@/lib/movie-data';
import { RatingStars } from './RatingStars';
import { MoviePoster } from './MoviePoster';
import { cn, formatRating } from '@/lib/utils';

const KIND_ICONS: Record<MovieKind, ReactNode> = {
    MOVIE: <IoFilm className="size-4"/>,
    SERIES: <TbDeviceTvOldFilled className="size-4"/>,
    CARTOON: <FaImage className="size-3.5"/>,
};

function seriesMeta(movie: MovieCardData) {
    if (movie.kind !== 'SERIES') return null;
    const episodesPerSeason = movie.episodesPerSeason ?? [];
    if (!movie.seasonsCount && !episodesPerSeason.length) return null;

    const seasons = movie.seasonsCount
        ? `${movie.seasonsCount} сез.`
        : null;
    const episodes = episodesPerSeason.length
        ? episodesPerSeason.map((count, index) => `${index + 1}: ${count}`).join(', ')
        : null;

    return [ seasons, episodes ? `${episodes} сер.` : null ].filter(Boolean).join(' · ');
}

export function MovieCard({ movie, className }: { movie: MovieCardData; className?: string }) {
    const meta = seriesMeta(movie);
    const { pathname, searchStr } = useLocation();
    const currentPath = `${pathname}${searchStr}`;

    return (
        <Link
            to="/movies/$movieId"
            params={{ movieId: movie.id }}
            search={{ from: currentPath }}
            className={cn(
                'group flex w-40 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-[0_14px_34px_rgb(0_0_0/0.24)] transition-all hover:-translate-y-1 hover:border-primary/60 hover:shadow-[0_20px_46px_rgb(0_0_0/0.34)]',
                className,
            )}
        >
            <div className="relative">
                <MoviePoster posterUrl={movie.posterUrl} title={movie.title} className="aspect-[3/4]"/>
                <span className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-md border border-border/70 bg-background/85 text-primary shadow-sm backdrop-blur">
                    {KIND_ICONS[movie.kind]}
                </span>
            </div>
            <div className="flex flex-col gap-1 p-2">
                <div className="flex items-center gap-1.5">
                    <RatingStars value={movie.avgRating}/>
                    <span className="text-xs text-muted-foreground">
                        {movie.ratingCount > 0 ? formatRating(movie.avgRating) : '—'}
                    </span>
                    <span
                        className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground"
                        aria-label={`Рецензий: ${movie.commentCount}`}
                        title={`Рецензий: ${movie.commentCount}`}
                    >
                        <MessageSquare className="size-3.5"/>
                        {movie.commentCount}
                    </span>
                </div>
                <h3 className="line-clamp-2 text-[13px] font-semibold leading-tight group-hover:text-primary">
                    {movie.title}
                </h3>
                <p className="text-xs text-muted-foreground">
                    {movie.year} · {movie.country}
                </p>
                {meta ? (
                    <p className="text-xs text-muted-foreground">
                        {meta}
                    </p>
                ) : null}
            </div>
        </Link>
    );
}
