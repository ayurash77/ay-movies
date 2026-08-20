import { z } from 'zod';

import { movieKindOptions } from './movie-data';

/** Limits protect direct form submissions as well as provider payloads. */
export const SERIES_METADATA_LIMITS = {
    maxSeasons: 100,
    maxSeasonNumber: 1000,
    maxEpisodesPerSeason: 1000,
    maxTotalEpisodes: 5000,
    maxEpisodeNumber: 10000,
    maxTitleLength: 500,
    maxDescriptionLength: 10000,
    maxUrlLength: 2048,
} as const;

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(value: string) {
    if (!isoDatePattern.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isHttpUrl(value: string) {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

const nullableTitleSchema = z.string().max(SERIES_METADATA_LIMITS.maxTitleLength).nullish();
const nullableDescriptionSchema = z.string().max(SERIES_METADATA_LIMITS.maxDescriptionLength).nullish();
const nullableAirDateSchema = z.string().refine(isIsoDate, 'Дата должна быть в формате YYYY-MM-DD').nullish();
const nullableHttpUrlSchema = z.string()
    .max(SERIES_METADATA_LIMITS.maxUrlLength)
    .url()
    .refine(isHttpUrl, 'Укажите корректную http/https ссылку')
    .nullish();

export const movieLookupSchema = z.object({
    found: z.boolean(),
    kind: z.enum(movieKindOptions).optional(),
    title: z.string().nullish(),
    originalTitle: z.string().nullish(),
    year: z.number().int().nullish(),
    country: z.string().nullish(),
    description: z.string().nullish(),
    director: z.string().nullish(),
    genres: z.array(z.string()).nullish(),
    starring: z.array(z.string()).nullish(),
    durationMin: z.number().int().nullish(),
    seasonsCount: z.number().int().nullish(),
    episodesPerSeason: z.array(z.number().int()).nullish(),
    posterUrl: z.string().nullish(),
});

export const lookupProviderSchema = z.enum([ 'kinopoisk-dev', 'kinopoisk-unofficial', 'wikidata' ]);

export const movieLookupCandidateSchema = movieLookupSchema.extend({
    provider: lookupProviderSchema,
    providerLabel: z.string(),
    externalId: z.string().nullish(),
    sourceUrl: z.string().nullish(),
    rating: z.number().nullish(),
    confidence: z.number().int().min(0).max(100).nullish(),
});

export const seriesEpisodeMetadataSchema = z.object({
    number: z.number().int().min(1).max(SERIES_METADATA_LIMITS.maxEpisodeNumber),
    name: nullableTitleSchema,
    originalName: nullableTitleSchema,
    description: nullableDescriptionSchema,
    originalDescription: nullableDescriptionSchema,
    airDate: nullableAirDateSchema,
    stillUrl: nullableHttpUrlSchema,
});

export const seriesSeasonMetadataSchema = z.object({
    number: z.number().int().min(1).max(SERIES_METADATA_LIMITS.maxSeasonNumber),
    name: nullableTitleSchema,
    originalName: nullableTitleSchema,
    description: nullableDescriptionSchema,
    originalDescription: nullableDescriptionSchema,
    airDate: nullableAirDateSchema,
    durationMin: z.number().int().positive().nullish(),
    posterUrl: nullableHttpUrlSchema,
    episodes: z.array(seriesEpisodeMetadataSchema).max(SERIES_METADATA_LIMITS.maxEpisodesPerSeason),
});

export const seriesMetadataSnapshotSchema = z
    .array(seriesSeasonMetadataSchema)
    .max(SERIES_METADATA_LIMITS.maxSeasons)
    .superRefine((seasons, context) => {
        const totalEpisodes = seasons.reduce((sum, season) => sum + season.episodes.length, 0);
        if (totalEpisodes > SERIES_METADATA_LIMITS.maxTotalEpisodes) {
            context.addIssue({
                code: 'custom',
                message: `Максимум ${SERIES_METADATA_LIMITS.maxTotalEpisodes} серий в снимке`,
            });
        }
    });

export const movieLookupDetailsSchema = movieLookupCandidateSchema.extend({
    seasons: seriesMetadataSnapshotSchema,
});

export type MovieLookup = z.infer<typeof movieLookupSchema>;
export type LookupProvider = z.infer<typeof lookupProviderSchema>;
export type MovieLookupCandidate = z.infer<typeof movieLookupCandidateSchema>;
export type SeriesEpisodeMetadata = z.infer<typeof seriesEpisodeMetadataSchema>;
export type SeriesSeasonMetadata = z.infer<typeof seriesSeasonMetadataSchema>;
export type MovieLookupDetails = z.infer<typeof movieLookupDetailsSchema>;
