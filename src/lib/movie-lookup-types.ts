import { z } from 'zod';

import { movieKindOptions } from './movie-data';

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
    number: z.number().int().positive(),
    name: z.string().nullish(),
    originalName: z.string().nullish(),
    description: z.string().nullish(),
    originalDescription: z.string().nullish(),
    airDate: z.string().nullish(),
    stillUrl: z.string().nullish(),
});

export const seriesSeasonMetadataSchema = z.object({
    number: z.number().int().positive(),
    name: z.string().nullish(),
    originalName: z.string().nullish(),
    description: z.string().nullish(),
    originalDescription: z.string().nullish(),
    airDate: z.string().nullish(),
    durationMin: z.number().int().positive().nullish(),
    posterUrl: z.string().nullish(),
    episodes: z.array(seriesEpisodeMetadataSchema),
});

export const movieLookupDetailsSchema = movieLookupCandidateSchema.extend({
    seasons: z.array(seriesSeasonMetadataSchema),
});

export type MovieLookup = z.infer<typeof movieLookupSchema>;
export type LookupProvider = z.infer<typeof lookupProviderSchema>;
export type MovieLookupCandidate = z.infer<typeof movieLookupCandidateSchema>;
export type SeriesEpisodeMetadata = z.infer<typeof seriesEpisodeMetadataSchema>;
export type SeriesSeasonMetadata = z.infer<typeof seriesSeasonMetadataSchema>;
export type MovieLookupDetails = z.infer<typeof movieLookupDetailsSchema>;
