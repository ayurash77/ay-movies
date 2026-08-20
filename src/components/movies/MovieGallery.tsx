import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Filter, Layers2, RotateCcw } from 'lucide-react';

import { useAppHeaderToolbar } from '@/components/AppTitle';
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
import { readCatalogPreferences, storeCatalogPreferences } from '@/lib/catalog-preferences';
import { groupMoviesByGenres } from '@/lib/genre-groups';
import type { MovieCardData } from '@/lib/movie-data';

type MovieGalleryProps = {
    movies: MovieCardData[];
    emptyText?: string;
    controlsStart?: ReactNode;
    controlsEnd?: ReactNode;
    onNeedCompleteSet?: () => void;
    preferenceScope?: string;
    userId?: string | null;
    selectedGenre?: string | null;
    onSelectedGenreChange?: (genre: string | null) => void;
    onGenreCountChange?: (count: number | null) => void;
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
            {groups.map(([ genre, genreMovies ]) => {
                const imageUrl = genreMovies.find((movie) => movie.posterUrl)?.posterUrl;
                return (
                    <button
                        key={genre}
                        type="button"
                        onClick={() => onSelect(genre)}
                        className="group relative flex min-h-36 overflow-hidden rounded-lg border border-card-border bg-card text-left shadow-[0_14px_34px_rgb(0_0_0/0.20)] transition-all hover:-translate-y-0.5 hover:border-card-border-active hover:shadow-[0_20px_46px_rgb(0_0_0/0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                        {imageUrl ? (
                            <img
                                src={imageUrl}
                                alt=""
                                loading="lazy"
                                className="absolute inset-0 size-full object-cover opacity-75 transition-transform duration-300 group-hover:scale-105"
                            />
                        ) : (
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,hsl(var(--primary)/0.45),transparent_42%),linear-gradient(135deg,hsl(var(--card)),hsl(var(--accent)))]"/>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/55 to-background/10"/>
                        <div className="relative z-10 flex min-h-36 flex-1 flex-col justify-end gap-1 p-4">
                            <span className="text-xl font-semibold text-foreground drop-shadow">{genre}</span>
                            <span className="text-sm text-foreground/80">
                                {genreMovies.length} {genreMovies.length === 1 ? 'позиция' : 'позиций'}
                            </span>
                        </div>
                    </button>
                );
            })}
        </div>
    );
}

export function MovieGallery({
    movies,
    emptyText,
    controlsStart,
    controlsEnd,
    onNeedCompleteSet,
    preferenceScope = 'default',
    userId,
    selectedGenre,
    onSelectedGenreChange,
    onGenreCountChange,
}: MovieGalleryProps) {
    const [ groupByOrigin, setGroupByOrigin ] = useState(true);
    const [ groupByCountry, setGroupByCountry ] = useState(false);
    const [ groupByGenre, setGroupByGenre ] = useState(false);
    const [ selectedGenreState, setSelectedGenreState ] = useState<string | null>(null);
    const [ hiddenCountries, setHiddenCountries ] = useState<Set<string>>(() => new Set());
    const [ loadedPreferenceKey, setLoadedPreferenceKey ] = useState<string | null>(null);
    const currentSelectedGenre = selectedGenre ?? selectedGenreState;
    const preferenceKey = `${userId ?? 'guest'}:${preferenceScope}`;

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

    const selectedGenreMovies = currentSelectedGenre
        ? genreGroups.find(([ genre ]) => genre === currentSelectedGenre)?.[1] ?? visibleMovies
        : null;

    useEffect(() => {
        const preferences = readCatalogPreferences(userId, preferenceScope);
        setGroupByOrigin(preferences.groupByOrigin);
        setGroupByCountry(preferences.groupByCountry);
        setGroupByGenre(preferences.groupByGenre);
        setHiddenCountries(new Set(preferences.hiddenCountries));
        setLoadedPreferenceKey(preferenceKey);
    }, [ preferenceKey, preferenceScope, userId ]);

    useEffect(() => {
        if (loadedPreferenceKey !== preferenceKey) return;
        storeCatalogPreferences(userId, preferenceScope, {
            groupByOrigin,
            groupByCountry,
            groupByGenre,
            hiddenCountries: [ ...hiddenCountries ],
        });
    }, [ groupByCountry, groupByGenre, groupByOrigin, hiddenCountries, loadedPreferenceKey, preferenceKey, preferenceScope, userId ]);

    useEffect(() => {
        if (!currentSelectedGenre) {
            onGenreCountChange?.(null);
            return;
        }
        setGroupByGenre(true);
    }, [ currentSelectedGenre, onGenreCountChange ]);

    useEffect(() => {
        if (!currentSelectedGenre) return;
        onGenreCountChange?.(selectedGenreMovies?.length ?? 0);
    }, [ currentSelectedGenre, onGenreCountChange, selectedGenreMovies?.length ]);

    const setSelectedGenreValue = useCallback((genre: string | null) => {
        if (onSelectedGenreChange) onSelectedGenreChange(genre);
        else setSelectedGenreState(genre);
    }, [ onSelectedGenreChange ]);

    const toggleCountry = useCallback((country: string) => {
        setHiddenCountries((current) => {
            const next = new Set(current);
            if (next.has(country)) next.delete(country);
            else next.add(country);
            return next;
        });
    }, []);

    const setGenreGrouping = useCallback((checked: boolean) => {
        setGroupByGenre(checked);
        setSelectedGenreValue(null);
        if (checked) onNeedCompleteSet?.();
    }, [ onNeedCompleteSet, setSelectedGenreValue ]);

    const handleSelectGenre = useCallback((genre: string) => {
        setGroupByGenre(true);
        setSelectedGenreValue(genre);
    }, [ setSelectedGenreValue ]);

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
            return <GenreCards groups={genreGroups} onSelect={handleSelectGenre}/>;
        }

        return renderGroupedMovies(selectedGenreMovies);
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

    const catalogControls = useMemo(() => (
        <>
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
                                setGenreGrouping(true);
                            }}
                        >
                            Отметить все
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onSelect={() => {
                                setGroupByOrigin(false);
                                setGroupByCountry(false);
                                setGroupByGenre(false);
                                setSelectedGenreValue(null);
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
                            onCheckedChange={(checked) => setGenreGrouping(Boolean(checked))}
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
        </>
    ), [
        controlsEnd,
        controlsStart,
        countries,
        groupByCountry,
        groupByGenre,
        groupByOrigin,
        hiddenCountries,
        setGenreGrouping,
        setSelectedGenreValue,
        toggleCountry,
    ]);
    const toolbarRegistered = useAppHeaderToolbar(catalogControls);

    return (
        <div className="flex flex-col gap-5">
            {!toolbarRegistered ? (
                <div className="flex items-center gap-2">
                    {catalogControls}
                </div>
            ) : null}

            {renderMovies()}
        </div>
    );
}
