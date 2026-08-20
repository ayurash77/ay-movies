import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import type { MovieDetails } from '@/lib/movie-data';
import type { SeriesEpisodeMetadata, SeriesSeasonMetadata } from '@/lib/series-metadata';
import { cn } from '@/lib/utils';

type SeasonEpisodes = SeriesSeasonMetadata & {
    id: string;
};

const russianDateFormatter = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
});

function formatAirDate(value: string | null | undefined) {
    if (!value) return null;

    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : russianDateFormatter.format(date);
}

function episodeContentFingerprint(episode: SeriesEpisodeMetadata) {
    return JSON.stringify([
        episode.number,
        episode.name ?? null,
        episode.originalName ?? null,
        episode.airDate ?? null,
    ]);
}

function codeUnitCompare(left: string, right: string) {
    return left < right ? -1 : left > right ? 1 : 0;
}

function seasonContentFingerprint(season: SeriesSeasonMetadata) {
    return JSON.stringify([
        season.number,
        season.name ?? null,
        season.originalName ?? null,
        season.airDate ?? null,
        season.episodes.map(episodeContentFingerprint).sort(codeUnitCompare),
    ]);
}

function fnv1a(value: string, seed: number) {
    let hash = seed >>> 0;

    for (let index = 0; index < value.length; index += 1) {
        hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193) >>> 0;
    }

    return hash;
}

function boundedSeasonHash(fingerprint: string) {
    const primary = fnv1a(fingerprint, 0x811c9dc5);
    const secondary = fnv1a(fingerprint, 0x811c9dc5 ^ 0x9e3779b9);

    return `${primary.toString(16).padStart(8, '0')}${secondary.toString(16).padStart(8, '0')}`;
}

function withContentIds(seasons: readonly SeriesSeasonMetadata[]): SeasonEpisodes[] {
    const occurrences = new Map<string, number>();

    return seasons.map((season) => {
        const fingerprint = seasonContentFingerprint(season);
        const occurrence = occurrences.get(fingerprint) ?? 0;
        occurrences.set(fingerprint, occurrence + 1);

        return {
            ...season,
            id: `season-${boundedSeasonHash(fingerprint)}-${occurrence}`,
        };
    });
}

function legacySeasons(movie: Pick<MovieDetails, 'seasonsCount' | 'episodesPerSeason'>): SeriesSeasonMetadata[] {
    const seasonCount = Math.max(movie.seasonsCount ?? 0, movie.episodesPerSeason.length);

    return Array.from({ length: seasonCount }, (_, seasonIndex) => {
        const number = seasonIndex + 1;
        const episodeCount = movie.episodesPerSeason[seasonIndex] ?? 0;

        return {
            number,
            name: null,
            originalName: null,
            description: null,
            originalDescription: null,
            airDate: null,
            durationMin: null,
            posterUrl: null,
            episodes: Array.from({ length: episodeCount }, (_, episodeIndex) => ({
                number: episodeIndex + 1,
                name: null,
                originalName: null,
                description: null,
                originalDescription: null,
                airDate: null,
                stillUrl: null,
            })),
        };
    });
}

function EpisodeRow({ episode, seriesTitle }: { episode: SeriesEpisodeMetadata; seriesTitle: string }) {
    const { number } = episode;
    const name = episode.name || `Серия ${number}`;
    const originalName = episode.originalName?.trim();
    const showOriginalName = Boolean(originalName && originalName !== name);
    const airDate = formatAirDate(episode.airDate);

    return (
        <li className="grid min-w-0 gap-3 border-b border-border/50 pb-5 last:border-b-0 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
            {episode.stillUrl ? (
                <img
                    src={episode.stillUrl}
                    alt={`Кадр из серии ${number}: ${name} (${seriesTitle})`}
                    loading="lazy"
                    className="aspect-video w-full rounded-md object-cover shadow-sm sm:w-40"
                />
            ) : null}
            <div className={cn('flex min-w-0 flex-col gap-1', !episode.stillUrl && 'sm:col-span-2')}>
                <p className="break-words text-base font-semibold text-foreground">
                    {number}. {name}
                </p>
                {showOriginalName ? (
                    <p className="break-words text-sm text-muted-foreground">{originalName}</p>
                ) : null}
                {airDate ? <p className="text-sm text-muted-foreground">{airDate}</p> : null}
                {episode.description ? (
                    <p className="max-w-3xl whitespace-pre-line break-words pt-1 text-sm leading-relaxed text-foreground/85">
                        {episode.description}
                    </p>
                ) : null}
            </div>
        </li>
    );
}

export function SeriesSeasons({ movie }: { movie: MovieDetails }) {
    const seasons = useMemo<SeasonEpisodes[]>(() => (
        movie.seriesSeasons.length > 0
            ? withContentIds(movie.seriesSeasons)
            : withContentIds(legacySeasons(movie))
    ), [ movie ]);
    const [ activeSeasonId, setActiveSeasonId ] = useState(seasons[0]?.id ?? '');
    const activeSeason = seasons.find((season) => season.id === activeSeasonId) ?? seasons[0];

    useEffect(() => {
        if (seasons.some((season) => season.id === activeSeasonId)) return;
        setActiveSeasonId(seasons[0]?.id ?? '');
    }, [ activeSeasonId, seasons ]);

    if (!activeSeason) {
        return (
            <p className="py-6 text-sm text-muted-foreground">
                Сезоны пока не заполнены.
            </p>
        );
    }

    return (
        <section className="flex min-w-0 flex-col gap-5">
            <div
                className="flex gap-2 overflow-x-auto pb-1"
                aria-label="Выбор сезона"
            >
                {seasons.map((season) => {
                    const isActive = season.id === activeSeason.id;

                    return (
                        <Button
                            key={season.id}
                            type="button"
                            variant={isActive ? 'default' : 'ghost'}
                            className="size-10 shrink-0 p-0"
                            aria-label={`Сезон ${season.number}`}
                            aria-pressed={isActive}
                            onClick={() => setActiveSeasonId(season.id)}
                        >
                            {season.number}
                        </Button>
                    );
                })}
            </div>

            <div className="flex min-w-0 flex-col gap-4">
                <h2 className="text-lg font-semibold">
                    {activeSeason.number} сезон, {activeSeason.episodes.length} серий
                </h2>
                {activeSeason.episodes.length > 0 ? (
                    <ol className="flex min-w-0 flex-col gap-5">
                        {activeSeason.episodes.map((episode, episodeIndex) => (
                            <EpisodeRow
                                key={`episode-${activeSeason.id}-${episode.number}-${episodeIndex}`}
                                episode={episode}
                                seriesTitle={movie.title}
                            />
                        ))}
                    </ol>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        Количество серий пока не заполнено.
                    </p>
                )}
            </div>
        </section>
    );
}
