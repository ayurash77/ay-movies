import { z } from 'zod';

const boundedTextSchema = z.string().trim().min(1).max(300);

function isHttpUrl(value: string) {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

function isIsoDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const httpUrlSchema = z.string().trim().url().refine(isHttpUrl);
const dateSchema = z.string().refine(isIsoDate);

export const personFilmographyEntrySchema = z.object({
    externalId: z.string().trim().regex(/^[1-9]\d*$/).max(100),
    title: boundedTextSchema,
    originalTitle: boundedTextSchema.nullable().optional(),
    year: z.number().int().min(1800).max(2200).nullable().optional(),
    posterUrl: httpUrlSchema.nullable().optional(),
    type: z.string().trim().min(1).max(100).nullable().optional(),
    rating: z.number().finite().min(0).max(10).nullable().optional(),
    role: boundedTextSchema.nullable().optional(),
    localMovieId: z.string().trim().min(1).max(100).optional(),
});

export const personFilmographySchema = z.array(personFilmographyEntrySchema).max(2_000);

export const personProfileSchema = z.object({
    provider: z.string().trim().min(1).max(100),
    externalId: z.string().trim().min(1).max(100),
    name: boundedTextSchema,
    originalName: boundedTextSchema.nullable(),
    photoUrl: httpUrlSchema.nullable(),
    sex: z.string().trim().min(1).max(100).nullable(),
    growthCm: z.number().int().min(30).max(300).nullable(),
    birthDate: dateSchema.nullable(),
    deathDate: dateSchema.nullable(),
    birthPlace: z.array(boundedTextSchema).max(100),
    professions: z.array(boundedTextSchema).max(100),
    facts: z.array(boundedTextSchema).max(100),
    filmography: personFilmographySchema,
});

export type PersonFilmographyEntry = z.infer<typeof personFilmographyEntrySchema>;
export type PersonProfile = z.infer<typeof personProfileSchema>;
export type PersonProfileLoadResult = {
    profile: PersonProfile;
    complete: boolean;
};
