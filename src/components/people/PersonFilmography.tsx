import { Link, useLocation } from '@tanstack/react-router';
import { ExternalLink, Film } from 'lucide-react';

import { MoviePoster } from '@/components/movies/MoviePoster';
import type { PersonFilmographyEntry } from '@/lib/person-data';
import { formatRating } from '@/lib/utils';

function formatFilmographyType(value: string) {
    const labels: Record<string, string> = {
        movie: 'Фильм',
        'tv-series': 'Сериал',
        'animated-series': 'Мультсериал',
        cartoon: 'Мультфильм',
        anime: 'Аниме',
    };
    return labels[value] ?? value;
}

function FilmographyContent({ entry }: { entry: PersonFilmographyEntry }) {
    return (
        <>
            <div className="relative aspect-2/3 overflow-hidden bg-muted">
                <MoviePoster posterUrl={entry.posterUrl ?? null} title={entry.title} className="h-full"/>
                {!entry.localMovieId ? (
                    <span className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-md border border-border/70 bg-background/85 text-muted-foreground backdrop-blur">
                        <ExternalLink className="size-3.5"/>
                    </span>
                ) : null}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1 p-2">
                <h3 className="line-clamp-2 text-sm font-semibold leading-tight group-hover:text-primary">
                    {entry.title}
                </h3>
                {entry.originalTitle && entry.originalTitle !== entry.title ? (
                    <p className="truncate text-xs text-muted-foreground">{entry.originalTitle}</p>
                ) : null}
                <div className="mt-auto flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    {entry.year ? <span>{entry.year}</span> : null}
                    {entry.type ? <span>{formatFilmographyType(entry.type)}</span> : null}
                    {entry.rating != null ? <span>{formatRating(entry.rating)}</span> : null}
                </div>
                {entry.role ? <p className="line-clamp-2 text-xs text-muted-foreground">{entry.role}</p> : null}
            </div>
        </>
    );
}

export function PersonFilmography({ entries }: { entries: PersonFilmographyEntry[] }) {
    const { pathname, searchStr } = useLocation();
    const currentPath = `${pathname}${searchStr}`;

    return (
        <section className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Film className="size-5 text-primary"/>
                Фильмография
                <span className="text-sm font-normal tabular-nums text-muted-foreground">{entries.length}</span>
            </h2>
            {entries.length === 0 ? (
                <p className="text-sm text-muted-foreground">Фильмография недоступна</p>
            ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                    {entries.map((entry) => {
                        const className = 'group flex min-w-0 flex-col overflow-hidden rounded-md border border-card-border bg-card shadow-[0_10px_24px_rgb(0_0_0/0.18)] transition-colors hover:border-primary/60';
                        return entry.localMovieId ? (
                            <Link
                                key={entry.externalId}
                                to="/movies/$movieId"
                                params={{ movieId: entry.localMovieId }}
                                search={{ from: currentPath }}
                                className={className}
                            >
                                <FilmographyContent entry={entry}/>
                            </Link>
                        ) : (
                            <a
                                key={entry.externalId}
                                href={`https://www.kinopoisk.ru/film/${entry.externalId}/`}
                                target="_blank"
                                rel="noreferrer"
                                className={className}
                            >
                                <FilmographyContent entry={entry}/>
                            </a>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
