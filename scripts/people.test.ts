import assert from 'node:assert/strict';
import test from 'node:test';

import {
    personFilmographySchema,
    personProfileSchema,
    type PersonProfile,
} from '../src/lib/person-data';
import { resolvePersonSnapshot } from '../src/lib/person-cache';
import {
    loadKinopoiskPerson,
    mapKinopoiskPerson,
} from '../src/server/movie-lookup-providers/kinopoisk-dev';
import {
    resolvePersonProfile,
    type PersonProfileStore,
} from '../src/server/people';

const NOW = new Date('2026-08-20T12:00:00Z');
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const cachedProfile: PersonProfile = {
    provider: 'kinopoisk-dev',
    externalId: '42',
    name: 'Тестовый актёр',
    originalName: 'Test Actor',
    photoUrl: 'https://example.com/person.jpg',
    sex: 'Мужской',
    growthCm: 180,
    birthDate: '1980-01-02',
    deathDate: null,
    birthPlace: [ 'Москва, СССР' ],
    professions: [ 'Актёр' ],
    facts: [ 'Факт' ],
    filmography: [ {
        externalId: '100',
        title: 'Старый фильм',
        originalTitle: 'Old Movie',
        year: 2020,
        posterUrl: 'https://example.com/old.jpg',
        type: 'movie',
        rating: 7.5,
        role: 'Герой',
    } ],
};

test('person DTOs reject oversized data and non-http image URLs', () => {
    assert.equal(personProfileSchema.safeParse({
        ...cachedProfile,
        name: 'x'.repeat(301),
    }).success, false);
    assert.equal(personProfileSchema.safeParse({
        ...cachedProfile,
        facts: Array.from({ length: 101 }, () => 'Факт'),
    }).success, false);
    assert.equal(personProfileSchema.safeParse({
        ...cachedProfile,
        filmography: Array.from({ length: 2_001 }, (_, index) => ({
            externalId: String(index + 1),
            title: `Фильм ${index + 1}`,
        })),
    }).success, false);
    assert.equal(personFilmographySchema.safeParse([ {
        externalId: '1',
        title: 'Фильм',
        posterUrl: 'file:///tmp/poster.jpg',
    } ]).success, false);
});

test('fresh cache is reused without provider request', async () => {
    let loads = 0;
    const result = await resolvePersonSnapshot({
        cached: {
            profile: cachedProfile,
            updatedAt: new Date('2026-08-19T12:00:00Z'),
        },
        now: NOW,
        maxAgeMs: MAX_AGE_MS,
        loadFresh: async () => {
            loads += 1;
            return { ...cachedProfile, name: 'Обновлённый актёр' };
        },
    });

    assert.equal(loads, 0);
    assert.equal(result.source, 'fresh-cache');
    assert.deepEqual(result.profile, cachedProfile);
});

test('stale cache is replaced with provider profile', async () => {
    const freshProfile = { ...cachedProfile, name: 'Обновлённый актёр' };
    const result = await resolvePersonSnapshot({
        cached: {
            profile: cachedProfile,
            updatedAt: new Date('2026-08-10T12:00:00Z'),
        },
        now: NOW,
        maxAgeMs: MAX_AGE_MS,
        loadFresh: async () => freshProfile,
    });

    assert.equal(result.source, 'provider');
    assert.deepEqual(result.profile, freshProfile);
});

test('stale cache remains available when refresh fails', async () => {
    const result = await resolvePersonSnapshot({
        cached: {
            profile: cachedProfile,
            updatedAt: new Date('2026-08-10T12:00:00Z'),
        },
        now: NOW,
        maxAgeMs: MAX_AGE_MS,
        loadFresh: async () => null,
    });

    assert.equal(result.source, 'stale-cache');
    assert.deepEqual(result.profile, cachedProfile);
});

test('person mapper keeps acting credits, deduplicates IDs, and retains fallback titles', () => {
    const profile = mapKinopoiskPerson('42', {
        id: 42,
        name: 'Иван Иванов',
        enName: 'Ivan Ivanov',
        photo: 'https://example.com/ivan.jpg',
        sex: 'Мужской',
        growth: 181,
        birthday: '1980-01-02T00:00:00.000Z',
        birthPlace: [ { value: 'Москва, СССР' } ],
        profession: [ { value: 'Актёр' } ],
        facts: [ { value: 'Первый факт' } ],
        movies: [
            { id: 100, name: 'Фильм из профиля', enProfession: 'actor', description: 'Герой' },
            { id: 100, name: 'Дубликат', enProfession: 'actor', description: 'Другая роль' },
            { id: 200, name: 'Режиссёрская работа', enProfession: 'director' },
            { id: 300, name: 'Без enrichment', enProfession: 'actor', description: 'Камео' },
        ],
    }, [ {
        id: 100,
        type: 'movie',
        name: 'Обогащённый фильм',
        alternativeName: 'Enriched Movie',
        year: 2020,
        poster: { previewUrl: 'https://example.com/movie.jpg' },
        rating: { kp: 8.1 },
    } ]);

    assert.ok(profile);
    assert.equal(profile.filmography.length, 2);
    assert.deepEqual(profile.filmography, [
        {
            externalId: '100',
            title: 'Обогащённый фильм',
            originalTitle: 'Enriched Movie',
            year: 2020,
            posterUrl: 'https://example.com/movie.jpg',
            type: 'movie',
            rating: 8.1,
            role: 'Герой',
        },
        {
            externalId: '300',
            title: 'Без enrichment',
            originalTitle: null,
            year: null,
            posterUrl: null,
            type: null,
            rating: null,
            role: 'Камео',
        },
    ]);
});

test('person loader enriches filmography in bounded parallel chunks of at most 100 IDs', async () => {
    const previousFetch = globalThis.fetch;
    const previousToken = process.env.KINOPOISK_DEV_TOKEN;
    const previousBaseUrl = process.env.KINOPOISK_DEV_BASE_URL;
    const chunkSizes: number[] = [];
    let activeChunks = 0;
    let maxActiveChunks = 0;

    process.env.KINOPOISK_DEV_TOKEN = 'test-token';
    process.env.KINOPOISK_DEV_BASE_URL = 'https://kinopoisk.test';
    globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        if (url.pathname === '/v1.4/person/42') {
            return Response.json({
                id: 42,
                name: 'Актёр',
                movies: Array.from({ length: 205 }, (_, index) => ({
                    id: index + 1,
                    name: `Фильм ${index + 1}`,
                    enProfession: 'actor',
                })),
            });
        }

        const ids = url.searchParams.getAll('id');
        chunkSizes.push(ids.length);
        activeChunks += 1;
        maxActiveChunks = Math.max(maxActiveChunks, activeChunks);
        await new Promise((resolve) => setTimeout(resolve, 10));
        activeChunks -= 1;
        return Response.json({
            docs: ids.map((id) => ({ id: Number(id), name: `Обогащённый ${id}` })),
        });
    };

    try {
        const profile = await loadKinopoiskPerson('42');

        assert.deepEqual(chunkSizes, [ 100, 100, 5 ]);
        assert.ok(maxActiveChunks > 1 && maxActiveChunks <= 4);
        assert.equal(profile?.filmography.length, 205);
        assert.equal(profile?.filmography[100]?.title, 'Обогащённый 101');
    } finally {
        globalThis.fetch = previousFetch;
        if (previousToken === undefined) delete process.env.KINOPOISK_DEV_TOKEN;
        else process.env.KINOPOISK_DEV_TOKEN = previousToken;
        if (previousBaseUrl === undefined) delete process.env.KINOPOISK_DEV_BASE_URL;
        else process.env.KINOPOISK_DEV_BASE_URL = previousBaseUrl;
    }
});

function createStore(person: Record<string, unknown>) {
    const calls = {
        updates: [] as Array<Record<string, unknown>>,
        movieQueries: [] as Array<Record<string, unknown>>,
    };
    const store: PersonProfileStore = {
        person: {
            findUnique: async () => person as never,
            update: async (args) => {
                calls.updates.push(args as Record<string, unknown>);
                return {};
            },
        },
        movie: {
            findMany: async (args) => {
                calls.movieQueries.push(args as Record<string, unknown>);
                return [ { id: 'local-100', metadataExternalId: '100' } ];
            },
        },
    };
    return { calls, store };
}

test('profile refresh persists validated snapshot and matches local movies by external ID', async () => {
    const { calls, store } = createStore({
        id: 'person-local-42',
        provider: 'kinopoisk-dev',
        externalId: '42',
        name: 'Компактное имя',
        originalName: null,
        photoUrl: null,
        sex: null,
        growthCm: null,
        birthDate: null,
        deathDate: null,
        birthPlace: [],
        professions: [ 'actor' ],
        facts: [],
        filmography: null,
        profileUpdatedAt: null,
    });

    const result = await resolvePersonProfile({
        personId: 'person-local-42',
        store,
        now: NOW,
        loadFresh: async () => cachedProfile,
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.person.filmography[0]?.localMovieId, 'local-100');
    assert.deepEqual(calls.movieQueries, [ {
        where: { metadataExternalId: { in: [ '100' ] } },
        select: { id: true, metadataExternalId: true },
    } ]);
    assert.deepEqual(calls.updates, [ {
        where: { id: 'person-local-42' },
        data: {
            name: 'Тестовый актёр',
            originalName: 'Test Actor',
            photoUrl: 'https://example.com/person.jpg',
            sex: 'Мужской',
            growthCm: 180,
            birthDate: new Date('1980-01-02T00:00:00.000Z'),
            deathDate: null,
            birthPlace: [ 'Москва, СССР' ],
            professions: [ 'Актёр' ],
            facts: [ 'Факт' ],
            filmography: cachedProfile.filmography,
            profileUpdatedAt: NOW,
        },
    } ]);
});

test('partial refresh does not replace cached filmography with an empty snapshot', async () => {
    const { calls, store } = createStore({
        id: 'person-local-42',
        provider: 'kinopoisk-dev',
        externalId: '42',
        name: cachedProfile.name,
        originalName: cachedProfile.originalName,
        photoUrl: cachedProfile.photoUrl,
        sex: cachedProfile.sex,
        growthCm: cachedProfile.growthCm,
        birthDate: new Date('1980-01-02T00:00:00.000Z'),
        deathDate: null,
        birthPlace: cachedProfile.birthPlace,
        professions: cachedProfile.professions,
        facts: cachedProfile.facts,
        filmography: cachedProfile.filmography,
        profileUpdatedAt: new Date('2026-08-10T12:00:00.000Z'),
    });

    const result = await resolvePersonProfile({
        personId: 'person-local-42',
        store,
        now: NOW,
        loadFresh: async () => ({
            ...cachedProfile,
            name: 'Обновлённое имя',
            filmography: [],
        }),
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.person.name, 'Обновлённое имя');
    assert.deepEqual(result.person.filmography, [ {
        ...cachedProfile.filmography[0],
        localMovieId: 'local-100',
    } ]);
    const update = calls.updates[0] as { data?: { filmography?: unknown } };
    assert.deepEqual(update.data?.filmography, cachedProfile.filmography);
});

test('failed first refresh leaves compact person untouched and returns unavailable', async () => {
    const compactPerson = {
        id: 'person-local-42',
        provider: 'kinopoisk-dev',
        externalId: '42',
        name: 'Компактное имя',
        originalName: 'Compact Name',
        photoUrl: 'https://example.com/compact.jpg',
        sex: null,
        growthCm: null,
        birthDate: null,
        deathDate: null,
        birthPlace: [],
        professions: [ 'actor' ],
        facts: [],
        filmography: null,
        profileUpdatedAt: null,
    };
    const { calls, store } = createStore(compactPerson);

    const result = await resolvePersonProfile({
        personId: 'person-local-42',
        store,
        now: NOW,
        loadFresh: async () => null,
    });

    assert.deepEqual(result, {
        ok: false,
        error: 'Профиль персоны временно недоступен',
    });
    assert.deepEqual(calls.updates, []);
    assert.equal(compactPerson.name, 'Компактное имя');
    assert.equal(compactPerson.photoUrl, 'https://example.com/compact.jpg');
});
