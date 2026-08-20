import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import {
    personFilmographySchema,
    personProfileSchema,
    type PersonFilmographyEntry,
    type PersonProfile,
    type PersonProfileLoadResult,
} from '@/lib/person-data';
import { resolvePersonSnapshot } from '@/lib/person-cache';

const PERSON_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const PERSON_REFRESH_RETRY_BACKOFF_MS = 15 * 60 * 1000;
const personProfileIdentitySchema = personProfileSchema.pick({
    provider: true,
    externalId: true,
});

type PersonProfileIdentity = z.infer<typeof personProfileIdentitySchema>;

type PersonProfileRow = {
    id: string;
    provider: string;
    externalId: string;
    name: string;
    originalName: string | null;
    photoUrl: string | null;
    sex: string | null;
    growthCm: number | null;
    birthDate: Date | null;
    deathDate: Date | null;
    birthPlace: string[];
    professions: string[];
    facts: string[];
    filmography: unknown;
    profileUpdatedAt: Date | null;
    profileRefreshAttemptedAt: Date | null;
};

type PersonUpdateData = Partial<{
    name: string;
    originalName: string | null;
    photoUrl: string | null;
    sex: string | null;
    growthCm: number | null;
    birthDate: Date | null;
    deathDate: Date | null;
    birthPlace: string[];
    professions: string[];
    facts: string[];
    filmography: PersonFilmographyEntry[];
    profileUpdatedAt: Date | null;
    profileRefreshAttemptedAt: Date;
}>;

export type PersonProfileStore = {
    person: {
        findUnique(args: {
            where: { id: string };
            select: Record<keyof PersonProfileRow, true>;
        }): PromiseLike<PersonProfileRow | null>;
        update(args: {
            where: { id: string };
            data: PersonUpdateData;
        }): PromiseLike<unknown>;
    };
    movie: {
        findMany(args: {
            where: { metadataExternalId: { in: string[] } };
            select: { id: true; metadataExternalId: true };
        }): PromiseLike<Array<{ id: string; metadataExternalId: string | null }>>;
    };
};

type ResolvePersonProfileInput = {
    personId: string;
    store: PersonProfileStore;
    now?: Date;
    maxAgeMs?: number;
    retryBackoffMs?: number;
    loadFresh: (provider: string, externalId: string) => Promise<PersonProfileLoadResult | null>;
};

const personSelect: Record<keyof PersonProfileRow, true> = {
    id: true,
    provider: true,
    externalId: true,
    name: true,
    originalName: true,
    photoUrl: true,
    sex: true,
    growthCm: true,
    birthDate: true,
    deathDate: true,
    birthPlace: true,
    professions: true,
    facts: true,
    filmography: true,
    profileUpdatedAt: true,
    profileRefreshAttemptedAt: true,
};

const personRefreshPromises = new Map<string, Promise<PersonProfileLoadResult | null>>();

function coalescedPersonRefresh(
    personId: string,
    loadFresh: () => Promise<PersonProfileLoadResult | null>,
) {
    const existing = personRefreshPromises.get(personId);
    if (existing) return existing;

    let pending!: Promise<PersonProfileLoadResult | null>;
    pending = Promise.resolve()
        .then(loadFresh)
        .finally(() => {
            if (personRefreshPromises.get(personId) === pending) {
                personRefreshPromises.delete(personId);
            }
        });
    personRefreshPromises.set(personId, pending);
    return pending;
}

function dateString(value: Date | null) {
    return value?.toISOString().slice(0, 10) ?? null;
}

function dateValue(value: string | null) {
    return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function compactProfile(row: PersonProfileRow, filmography: PersonFilmographyEntry[]): PersonProfile | null {
    const parsed = personProfileSchema.safeParse({
        provider: row.provider,
        externalId: row.externalId,
        name: row.name,
        originalName: row.originalName,
        photoUrl: row.photoUrl,
        sex: row.sex,
        growthCm: row.growthCm,
        birthDate: dateString(row.birthDate),
        deathDate: dateString(row.deathDate),
        birthPlace: row.birthPlace,
        professions: row.professions,
        facts: row.facts,
        filmography,
    });
    return parsed.success ? parsed.data : null;
}

function recoveryIdentity(row: PersonProfileRow): PersonProfileIdentity | null {
    const parsed = personProfileIdentitySchema.safeParse({
        provider: row.provider,
        externalId: row.externalId,
    });
    return parsed.success ? parsed.data : null;
}

function mergePartialFilmography(
    cached: PersonFilmographyEntry[],
    fresh: PersonFilmographyEntry[],
) {
    const cachedById = new Map(cached.map((entry) => [ entry.externalId, entry ]));
    const freshIds = new Set(fresh.map((entry) => entry.externalId));
    const merged = fresh.map((entry) => {
        const previous = cachedById.get(entry.externalId);
        if (!previous) return entry;

        return {
            ...entry,
            originalTitle: entry.originalTitle ?? previous.originalTitle ?? null,
            year: entry.year ?? previous.year ?? null,
            posterUrl: entry.posterUrl ?? previous.posterUrl ?? null,
            type: entry.type ?? previous.type ?? null,
            rating: entry.rating ?? previous.rating ?? null,
        };
    });

    return [ ...merged, ...cached.filter((entry) => !freshIds.has(entry.externalId)) ];
}

function mergeFreshProfile(
    compact: PersonProfile | null,
    identity: PersonProfileIdentity,
    fresh: PersonProfile,
    complete: boolean,
) {
    const parsed = personProfileSchema.safeParse({
        ...fresh,
        provider: identity.provider,
        externalId: identity.externalId,
        name: fresh.name,
        originalName: fresh.originalName ?? compact?.originalName ?? null,
        photoUrl: fresh.photoUrl ?? compact?.photoUrl ?? null,
        sex: fresh.sex ?? compact?.sex ?? null,
        growthCm: fresh.growthCm ?? compact?.growthCm ?? null,
        birthDate: fresh.birthDate ?? compact?.birthDate ?? null,
        deathDate: fresh.deathDate ?? compact?.deathDate ?? null,
        birthPlace: fresh.birthPlace.length ? fresh.birthPlace : (compact?.birthPlace ?? []),
        professions: fresh.professions.length ? fresh.professions : (compact?.professions ?? []),
        facts: fresh.facts.length ? fresh.facts : (compact?.facts ?? []),
        filmography: complete
            ? fresh.filmography
            : mergePartialFilmography(compact?.filmography ?? [], fresh.filmography),
    });
    return parsed.success ? parsed.data : null;
}

function storedFilmography(entries: PersonFilmographyEntry[]) {
    return entries.map(({ localMovieId: _localMovieId, ...entry }) => entry);
}

async function attachLocalMovies(store: PersonProfileStore, profile: PersonProfile) {
    const externalIds = profile.filmography.map((entry) => entry.externalId);
    if (!externalIds.length) return profile;

    try {
        const localMovies = await store.movie.findMany({
            where: { metadataExternalId: { in: externalIds } },
            select: { id: true, metadataExternalId: true },
        });
        const localIds = new Map(
            localMovies.flatMap((movie) => movie.metadataExternalId
                ? [ [ movie.metadataExternalId, movie.id ] as const ]
                : []),
        );
        return {
            ...profile,
            filmography: profile.filmography.map((entry) => ({
                ...entry,
                ...(localIds.get(entry.externalId)
                    ? { localMovieId: localIds.get(entry.externalId) }
                    : {}),
            })),
        };
    } catch {
        return profile;
    }
}

export async function resolvePersonProfile({
    personId,
    store,
    now = new Date(),
    maxAgeMs = PERSON_CACHE_MAX_AGE_MS,
    retryBackoffMs = PERSON_REFRESH_RETRY_BACKOFF_MS,
    loadFresh,
}: ResolvePersonProfileInput) {
    const row = await store.person.findUnique({
        where: { id: personId },
        select: personSelect,
    });
    if (!row) return { ok: false as const, error: 'Персона не найдена' };

    const parsedFilmography = personFilmographySchema.safeParse(row.filmography);
    const compact = compactProfile(row, parsedFilmography.success ? parsedFilmography.data : []);
    const identity = compact ?? recoveryIdentity(row);
    if (!identity) {
        return { ok: false as const, error: 'Профиль персоны временно недоступен' };
    }

    const cached = compact && parsedFilmography.success
        ? { profile: compact, updatedAt: row.profileUpdatedAt }
        : null;
    const snapshot = await resolvePersonSnapshot({
        cached,
        now,
        maxAgeMs,
        refreshAttemptedAt: row.profileRefreshAttemptedAt,
        retryBackoffMs,
        loadFresh: () => coalescedPersonRefresh(row.id, async () => {
            const recordRefreshAttempt = async () => {
                try {
                    await store.person.update({
                        where: { id: row.id },
                        data: { profileRefreshAttemptedAt: now },
                    });
                } catch {
                    // Attempt tracking is best-effort.
                }
            };

            let fresh: PersonProfileLoadResult | null;
            try {
                fresh = await loadFresh(row.provider, row.externalId);
            } catch (error) {
                await recordRefreshAttempt();
                throw error;
            }
            if (!fresh) {
                await recordRefreshAttempt();
                return null;
            }

            const profile = mergeFreshProfile(compact, identity, fresh.profile, fresh.complete);
            if (!profile) {
                await recordRefreshAttempt();
                return null;
            }

            try {
                await store.person.update({
                    where: { id: row.id },
                    data: {
                        name: profile.name,
                        originalName: profile.originalName,
                        photoUrl: profile.photoUrl,
                        sex: profile.sex,
                        growthCm: profile.growthCm,
                        birthDate: dateValue(profile.birthDate),
                        deathDate: dateValue(profile.deathDate),
                        birthPlace: profile.birthPlace,
                        professions: profile.professions,
                        facts: profile.facts,
                        filmography: storedFilmography(profile.filmography),
                        profileUpdatedAt: fresh.complete ? now : cached?.updatedAt ?? null,
                        profileRefreshAttemptedAt: now,
                    },
                });
            } catch {
                // Cache persistence must not make freshly loaded provider data unavailable.
            }

            return { profile, complete: fresh.complete };
        }),
    });
    if (!snapshot.profile) {
        return { ok: false as const, error: 'Профиль персоны временно недоступен' };
    }

    return {
        ok: true as const,
        person: await attachLocalMovies(store, snapshot.profile),
        source: snapshot.source,
    };
}

export const getPerson = createServerFn({ method: 'GET' })
    .validator(z.object({ personId: z.string().trim().min(1).max(100) }))
    .handler(async ({ data }) => {
        const { db } = await import('@/lib/db');
        const { loadKinopoiskPerson } = await import('./movie-lookup-providers/kinopoisk-dev');

        return resolvePersonProfile({
            personId: data.personId,
            store: db,
            loadFresh: (provider, externalId) => provider === 'kinopoisk-dev'
                ? loadKinopoiskPerson(externalId)
                : Promise.resolve(null),
        });
    });
