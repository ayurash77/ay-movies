import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import type { MovieDetails } from '@/lib/movie-data';
import type { SeriesEpisodeMetadata } from '@/lib/series-metadata';
import { cn } from '@/lib/utils';

type SeasonEpisodes = {
    number: number;
    episodes: SeriesEpisodeMetadata[];
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

function legacySeasons(movie: Pick<MovieDetails, 'seasonsCount' | 'episodesPerSeason'>): SeasonEpisodes[] {
    const seasonCount = Math.max(movie.seasonsCount ?? 0, movie.episodesPerSeason.length);

    return Array.from({ length: seasonCount }, (_, seasonIndex) => {
        const number = seasonIndex + 1;
        const episodeCount = movie.episodesPerSeason[seasonIndex] ?? 0;

        return {
            number,
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
    const showOriginalName = originalName && originalName.localeCompare(name, 'ru', { sensitivity: 'accent' }) !== 0;
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
            ? movie.seriesSeasons.map((season) => ({ number: season.number, episodes: season.episodes }))
            : legacySeasons(movie)
    ), [ movie ]);
    const [ activeSeasonNumber, setActiveSeasonNumber ] = useState(seasons[0]?.number ?? 1);
    const activeSeason = seasons.find((season) => season.number === activeSeasonNumber) ?? seasons[0];

    useEffect(() => {
        if (seasons.some((season) => season.number === activeSeasonNumber)) return;
        setActiveSeasonNumber(seasons[0]?.number ?? 1);
    }, [ activeSeasonNumber, seasons ]);

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
                    const isActive = season.number === activeSeason.number;

                    return (
                        <Button
                            key={season.number}
                            type="button"
                            variant={isActive ? 'default' : 'ghost'}
                            className="size-10 shrink-0 p-0"
                            aria-label={`Сезон ${season.number}`}
                            aria-pressed={isActive}
                            onClick={() => setActiveSeasonNumber(season.number)}
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
                        {activeSeason.episodes.map((episode) => (
                            <EpisodeRow
                                key={episode.number}
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
