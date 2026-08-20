import {
    seriesEpisodeMetadataSchema,
    seriesSeasonMetadataSchema,
    type SeriesEpisodeMetadata,
    type SeriesSeasonMetadata,
} from './movie-lookup-types';

export type { SeriesEpisodeMetadata, SeriesSeasonMetadata } from './movie-lookup-types';

function normalizeText(value: string | null | undefined): string | null {
    const normalized = value?.trim();
    return normalized || null;
}

function normalizeAirDate(value: string | null | undefined): string | null {
    const normalized = normalizeText(value);

    if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
        return null;
    }

    const date = new Date(`${normalized}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized
        ? null
        : normalized;
}

function isPositiveInteger(value: number | null | undefined): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function normalizeEpisode(episode: SeriesEpisodeMetadata): SeriesEpisodeMetadata | null {
    if (!isPositiveInteger(episode.number)) {
        return null;
    }

    return seriesEpisodeMetadataSchema.parse({
        number: episode.number,
        name: normalizeText(episode.name),
        originalName: normalizeText(episode.originalName),
        description: normalizeText(episode.description),
        originalDescription: normalizeText(episode.originalDescription),
        airDate: normalizeAirDate(episode.airDate),
        stillUrl: normalizeText(episode.stillUrl),
    });
}

export function normalizeSeriesMetadata(seasons: readonly SeriesSeasonMetadata[]): SeriesSeasonMetadata[] {
    const seasonNumbers = new Set<number>();

    const normalizedSeasons = seasons.flatMap((season) => {
        if (!isPositiveInteger(season.number) || seasonNumbers.has(season.number)) {
            return [];
        }

        seasonNumbers.add(season.number);
        const episodeNumbers = new Set<number>();
        const episodes = season.episodes.flatMap((episode) => {
            const normalizedEpisode = normalizeEpisode(episode);

            if (!normalizedEpisode || episodeNumbers.has(normalizedEpisode.number)) {
                return [];
            }

            episodeNumbers.add(normalizedEpisode.number);
            return [ normalizedEpisode ];
        }).sort((left, right) => left.number - right.number);

        return [ seriesSeasonMetadataSchema.parse({
            number: season.number,
            name: normalizeText(season.name),
            originalName: normalizeText(season.originalName),
            description: normalizeText(season.description),
            originalDescription: normalizeText(season.originalDescription),
            airDate: normalizeAirDate(season.airDate),
            durationMin: isPositiveInteger(season.durationMin) ? season.durationMin : null,
            posterUrl: normalizeText(season.posterUrl),
            episodes,
        }) ];
    });

    return normalizedSeasons.sort((left, right) => left.number - right.number);
}

export function seriesMetadataSummary(seasons: readonly SeriesSeasonMetadata[]) {
    return {
        seasonsCount: seasons.length,
        episodesPerSeason: seasons.map((season) => season.episodes.length),
    };
}

export function seriesSnapshotWriteData(seasons: readonly SeriesSeasonMetadata[]) {
    return seasons.map((season) => ({
        number: season.number,
        name: season.name,
        originalName: season.originalName,
        description: season.description,
        originalDescription: season.originalDescription,
        airDate: season.airDate ? new Date(`${season.airDate}T00:00:00.000Z`) : null,
        durationMin: season.durationMin,
        posterUrl: season.posterUrl,
        episodes: {
            create: season.episodes.map((episode) => ({
                number: episode.number,
                name: episode.name,
                originalName: episode.originalName,
                description: episode.description,
                originalDescription: episode.originalDescription,
                airDate: episode.airDate ? new Date(`${episode.airDate}T00:00:00.000Z`) : null,
                stillUrl: episode.stillUrl,
            })),
        },
    }));
}
