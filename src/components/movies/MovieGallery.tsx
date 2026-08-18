import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, Filter, Layers2, RotateCcw } from 'lucide-react';

import { MovieCard } from '@/components/movies/MovieCard';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { groupMoviesByGenres } from '@/lib/genre-groups';
import type { MovieCardData } from '@/lib/movie-data';

type MovieGalleryProps = {
    movies: MovieCardData[];
    emptyText?: string;
    controlsStart?: ReactNode;
    controlsEnd?: ReactNode;
};

const DOMESTIC_COUNTRIES = new Set([ 'россия', 'рф', 'ссср' ]);

function splitCountries(country: string) {
    return country.split(',').map((item) => item.trim()).filter(Boolean);
}

function primaryCountry(movie: MovieCardData) {
    return splitCountries(movie.country)[0] ?? 'Без страны';
}

function originGroup(movie: MovieCardData) {
    const countries = splitCountries(movie.country).map((item) => item.toLowerCase());
    return countries.some((country) => DOMESTIC_COUNTRIES.has(country))
        ? 'Отечественные'
        : 'Зарубежные';
}

function groupBy<T extends string>(movies: MovieCardData[], key: (movie: MovieCardData) => T) {
    const map = new Map<T, MovieCardData[]>();
    for (const movie of movies) {
        const group = key(movie);
        map.set(group, [ ...(map.get(group) ?? []), movie ]);
    }
    return map;
}

function MovieGrid({ movies }: { movies: MovieCardData[] }) {
    return (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {movies.map((movie) => (
                <MovieCard key={movie.id} movie={movie} className="w-full"/>
            ))}
        </div>
    );
}

function GenreCards({
    groups,
    onSelect,
}: {
    groups: Array<[ string, MovieCardData[] ]>;
    onSelect: (genre: string) => void;
}) {
    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map(([ genre, genreMovies ]) => (
                <button
                    key={genre}
                    type="button"
                    onClick={() => onSelect(genre)}
                    className="flex min-h-28 flex-col items-start justify-between rounded-lg border border-card-border bg-card p-4 text-left shadow-[0_14px_34px_rgb(0_0_0/0.20)] transition-all hover:-translate-y-0.5 hover:border-card-border-active hover:bg-card-active hover:shadow-[0_20px_46px_rgb(0_0_0/0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                    <span className="text-lg font-semibold">{genre}</span>
                    <span className="text-sm text-muted-foreground">
                        {genreMovies.length} {genreMovies.length === 1 ? 'позиция' : 'позиций'}
                    </span>
                </button>
            ))}
        </div>
    );
}

export function MovieGallery({ movies, emptyText, controlsStart, controlsEnd }: MovieGalleryProps) {
    const [ groupByOrigin, setGroupByOrigin ] = useState(true);
    const [ groupByCountry, setGroupByCountry ] = useState(false);
    const [ groupByGenre, setGroupByGenre ] = useState(false);
    const [ selectedGenre, setSelectedGenre ] = useState<string | null>(null);
    const [ hiddenCountries, setHiddenCountries ] = useState<Set<string>>(() => new Set());

    const countries = useMemo(
        () => [ ...new Set(movies.map(primaryCountry)) ].sort((a, b) => a.localeCompare(b, 'ru')),
        [ movies ],
    );

    const visibleMovies = useMemo(
        () => movies.filter((movie) => !hiddenCountries.has(primaryCountry(movie))),
        [ movies, hiddenCountries ],
    );

    const genreGroups = useMemo(
        () => groupMoviesByGenres(visibleMovies),
        [ visibleMovies ],
    );

    const selectedGenreMovies = selectedGenre
        ? genreGroups.find(([ genre ]) => genre === selectedGenre)?.[1] ?? null
        : null;

    const toggleCountry = (country: string) => {
        setHiddenCountries((current) => {
            const next = new Set(current);
            if (next.has(country)) next.delete(country);
            else next.add(country);
            return next;
        });
    };

    const renderCountryGroups = (items: MovieCardData[]) => {
        const groups = [ ...groupBy(items, primaryCountry).entries() ]
            .sort(([ a ], [ b ]) => a.localeCompare(b, 'ru'));

        return (
            <div className="flex flex-col gap-6">
                {groups.map(([ country, countryMovies ]) => (
                    <section key={country} className="flex flex-col gap-3">
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                            {country}
                        </h3>
                        <MovieGrid movies={countryMovies}/>
                    </section>
                ))}
            </div>
        );
    };

    const renderGroupedMovies = (items: MovieCardData[]) => {
        if (groupByOrigin) {
            const groups = groupBy(items, originGroup);
            const ordered = [ 'Отечественные', 'Зарубежные' ] as const;

            return (
                <div className="flex flex-col gap-8">
                    {ordered.map((title) => {
                        const items = groups.get(title) ?? [];
                        if (!items.length) return null;

                        return (
                            <section key={title} className="flex flex-col gap-4">
                                <h2 className="text-xl font-bold">{title}</h2>
                                {groupByCountry
                                    ? renderCountryGroups(items)
                                    : <MovieGrid movies={items}/>}
                            </section>
                        );
                    })}
                </div>
            );
        }

        if (groupByCountry) return renderCountryGroups(items);
        return <MovieGrid movies={items}/>;
    };

    const renderGenreMode = () => {
        if (!selectedGenreMovies) {
            return <GenreCards groups={genreGroups} onSelect={setSelectedGenre}/>;
        }

        return (
            <div className="flex flex-col gap-5">
                <div className="flex flex-wrap items-center gap-3">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedGenre(null)}>
                        <ArrowLeft/>
                        Все жанры
                    </Button>
                    <div className="flex flex-col">
                        <h2 className="text-xl font-bold">{selectedGenre}</h2>
                        <span className="text-sm text-muted-foreground">
                            {selectedGenreMovies.length} {selectedGenreMovies.length === 1 ? 'позиция' : 'позиций'}
                        </span>
                    </div>
                </div>
                {renderGroupedMovies(selectedGenreMovies)}
            </div>
        );
    };

    const renderMovies = () => {
        if (visibleMovies.length === 0) {
            return (
                <p className="py-10 text-center text-muted-foreground">
                    {emptyText ?? 'Ничего не найдено'}
                </p>
            );
        }

        if (groupByGenre) return renderGenreMode();
        return renderGroupedMovies(visibleMovies);
    };

    return (
        <div className="flex flex-col gap-5">
            <div className="flex items-center gap-2">
                {controlsStart}
                <div className="ml-auto flex shrink-0 items-center gap-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon" aria-label="Группировки" title="Группировки">
                                <Layers2/>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem
                                onSelect={() => {
                                    setGroupByOrigin(true);
                                    setGroupByCountry(true);
                                    setGroupByGenre(true);
                                    setSelectedGenre(null);
                                }}
                            >
                                Отметить все
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onSelect={() => {
                                    setGroupByOrigin(false);
                                    setGroupByCountry(false);
                                    setGroupByGenre(false);
                                    setSelectedGenre(null);
                                }}
                            >
                                Снять все
                            </DropdownMenuItem>
                            <DropdownMenuSeparator/>
                            <DropdownMenuCheckboxItem
                                checked={groupByOrigin}
                                onCheckedChange={(checked) => setGroupByOrigin(Boolean(checked))}
                            >
                                Отечественные / зарубежные
                            </DropdownMenuCheckboxItem>
                            <DropdownMenuCheckboxItem
                                checked={groupByCountry}
                                onCheckedChange={(checked) => setGroupByCountry(Boolean(checked))}
                            >
                                Страны
                            </DropdownMenuCheckboxItem>
                            <DropdownMenuCheckboxItem
                                checked={groupByGenre}
                                onCheckedChange={(checked) => {
                                    setGroupByGenre(Boolean(checked));
                                    setSelectedGenre(null);
                                }}
                            >
                                Жанры
                            </DropdownMenuCheckboxItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" aria-label="Фильтры" title="Фильтры">
                            <Filter/>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="max-h-96 min-w-56 overflow-y-auto">
                        <div className="px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Страны
                        </div>
                        {countries.map((country) => (
                            <DropdownMenuCheckboxItem
                                key={country}
                                checked={!hiddenCountries.has(country)}
                                onCheckedChange={() => toggleCountry(country)}
                            >
                                {country}
                            </DropdownMenuCheckboxItem>
                        ))}
                        {hiddenCountries.size ? (
                            <>
                                <DropdownMenuSeparator/>
                                <DropdownMenuItem onSelect={() => setHiddenCountries(new Set())}>
                                    <RotateCcw/>
                                    Сбросить фильтры
                                </DropdownMenuItem>
                            </>
                        ) : null}
                    </DropdownMenuContent>
                </DropdownMenu>

                {controlsEnd}
                </div>
            </div>

            {renderMovies()}
        </div>
    );
}
