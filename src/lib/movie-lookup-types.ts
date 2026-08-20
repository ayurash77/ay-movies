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

export type MovieLookup = z.infer<typeof movieLookupSchema>;
export type LookupProvider = z.infer<typeof lookupProviderSchema>;
export type MovieLookupCandidate = z.infer<typeof movieLookupCandidateSchema>;
