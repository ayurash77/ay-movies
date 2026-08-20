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
    assert.equal(personFilmographySchema.safeParse([ {
        externalId: '1',
        title: 'Фильм',
        posterUrl: `https://example.com/${'x'.repeat(2_049)}`,
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
            return {
                profile: { ...cachedProfile, name: 'Обновлённый актёр' },
                complete: true,
            };
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
        loadFresh: async () => ({ profile: freshProfile, complete: true }),
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

test('stale cache remains available when refresh rejects', async () => {
    const result = await resolvePersonSnapshot({
        cached: {
            profile: cachedProfile,
            updatedAt: new Date('2026-08-10T12:00:00Z'),
        },
        now: NOW,
        maxAgeMs: MAX_AGE_MS,
        loadFresh: async () => {
            throw new Error('provider failed');
        },
    });

    assert.equal(result.source, 'stale-cache');
    assert.deepEqual(result.profile, cachedProfile);
});

test('refresh rejection without cache returns unavailable', async () => {
    const result = await resolvePersonSnapshot({
        cached: null,
        now: NOW,
        maxAgeMs: MAX_AGE_MS,
        loadFresh: async () => {
            throw new Error('provider failed');
        },
    });

    assert.deepEqual(result, { source: 'unavailable', profile: null });
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

test('person mapper ignores malformed collection shapes and entries', () => {
    const profile = mapKinopoiskPerson('42', {
        name: 'Актёр',
        birthPlace: 42,
        profession: [ null, { value: 'Актёр' } ],
        facts: { value: 'Некорректный факт' },
        movies: [
            null,
            'invalid',
            { id: 100, name: 'Базовое название', enProfession: 'actor', description: 'Герой' },
        ],
    } as never, [
        null,
        'invalid',
        {
            id: 100,
            name: 'Обогащённое название',
            year: '2020',
            poster: { previewUrl: 123 },
            rating: { kp: '8.1' },
        },
    ] as never);

    assert.ok(profile);
    assert.deepEqual(profile.birthPlace, []);
    assert.deepEqual(profile.professions, [ 'Актёр' ]);
    assert.deepEqual(profile.facts, []);
    assert.deepEqual(profile.filmography, [ {
        externalId: '100',
        title: 'Обогащённое название',
        originalTitle: null,
        year: null,
        posterUrl: null,
        type: null,
        rating: null,
        role: 'Герой',
    } ]);
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
        const loaded = await loadKinopoiskPerson('42');

        assert.deepEqual(chunkSizes, [ 100, 100, 5 ]);
        assert.ok(maxActiveChunks > 1 && maxActiveChunks <= 4);
        assert.equal(loaded?.complete, true);
        assert.equal(loaded?.profile.filmography.length, 205);
        assert.equal(loaded?.profile.filmography[100]?.title, 'Обогащённый 101');
    } finally {
        globalThis.fetch = previousFetch;
        if (previousToken === undefined) delete process.env.KINOPOISK_DEV_TOKEN;
        else process.env.KINOPOISK_DEV_TOKEN = previousToken;
        if (previousBaseUrl === undefined) delete process.env.KINOPOISK_DEV_BASE_URL;
        else process.env.KINOPOISK_DEV_BASE_URL = previousBaseUrl;
    }
});

test('person loader returns partial base filmography when an enrichment chunk fails', async () => {
    const previousFetch = globalThis.fetch;
    const previousToken = process.env.KINOPOISK_DEV_TOKEN;
    const previousBaseUrl = process.env.KINOPOISK_DEV_BASE_URL;

    process.env.KINOPOISK_DEV_TOKEN = 'test-token';
    process.env.KINOPOISK_DEV_BASE_URL = 'https://kinopoisk.test';
    globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        if (url.pathname === '/v1.4/person/42') {
            return Response.json({
                id: 42,
                name: 'Актёр',
                movies: [ {
                    id: 100,
                    name: 'Базовое название',
                    enProfession: 'actor',
                    description: 'Свежая роль',
                } ],
            });
        }
        return Response.json({}, { status: 503 });
    };

    try {
        const loaded = await loadKinopoiskPerson('42');

        assert.equal(loaded?.complete, false);
        assert.deepEqual(loaded?.profile.filmography, [ {
            externalId: '100',
            title: 'Базовое название',
            originalTitle: null,
            year: null,
            posterUrl: null,
            type: null,
            rating: null,
            role: 'Свежая роль',
        } ]);
    } finally {
        globalThis.fetch = previousFetch;
        if (previousToken === undefined) delete process.env.KINOPOISK_DEV_TOKEN;
        else process.env.KINOPOISK_DEV_TOKEN = previousToken;
        if (previousBaseUrl === undefined) delete process.env.KINOPOISK_DEV_BASE_URL;
        else process.env.KINOPOISK_DEV_BASE_URL = previousBaseUrl;
    }
});

test('person loader rejects malformed HTTP 200 person payloads', async () => {
    const previousFetch = globalThis.fetch;
    const previousToken = process.env.KINOPOISK_DEV_TOKEN;
    const previousBaseUrl = process.env.KINOPOISK_DEV_BASE_URL;
    const payloads = [
        { id: 0, name: 'Актёр', movies: [] },
        { id: 42, name: '   ', enName: '', movies: [] },
        { id: 42, name: 'Актёр', movies: { id: 100 } },
    ];

    process.env.KINOPOISK_DEV_TOKEN = 'test-token';
    process.env.KINOPOISK_DEV_BASE_URL = 'https://kinopoisk.test';
    globalThis.fetch = async () => Response.json(payloads.shift());

    try {
        assert.equal(await loadKinopoiskPerson('42'), null);
        assert.equal(await loadKinopoiskPerson('42'), null);
        assert.equal(await loadKinopoiskPerson('42'), null);

        globalThis.fetch = async () => Response.json({
            id: 42,
            name: 'Актёр',
            movies: { id: 100 },
        });
        const stale = await resolvePersonSnapshot({
            cached: {
                profile: cachedProfile,
                updatedAt: new Date('2026-08-10T12:00:00Z'),
            },
            now: NOW,
            maxAgeMs: MAX_AGE_MS,
            loadFresh: () => loadKinopoiskPerson('42'),
        });
        const unavailable = await resolvePersonSnapshot({
            cached: null,
            now: NOW,
            maxAgeMs: MAX_AGE_MS,
            loadFresh: () => loadKinopoiskPerson('42'),
        });

        assert.equal(stale.source, 'stale-cache');
        assert.deepEqual(stale.profile, cachedProfile);
        assert.deepEqual(unavailable, { source: 'unavailable', profile: null });
    } finally {
        globalThis.fetch = previousFetch;
        if (previousToken === undefined) delete process.env.KINOPOISK_DEV_TOKEN;
        else process.env.KINOPOISK_DEV_TOKEN = previousToken;
        if (previousBaseUrl === undefined) delete process.env.KINOPOISK_DEV_BASE_URL;
        else process.env.KINOPOISK_DEV_BASE_URL = previousBaseUrl;
    }
});

test('person loader ignores malformed enrichment overrides and keeps base title', async () => {
    const previousFetch = globalThis.fetch;
    const previousToken = process.env.KINOPOISK_DEV_TOKEN;
    const previousBaseUrl = process.env.KINOPOISK_DEV_BASE_URL;

    process.env.KINOPOISK_DEV_TOKEN = 'test-token';
    process.env.KINOPOISK_DEV_BASE_URL = 'https://kinopoisk.test';
    globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        if (url.pathname === '/v1.4/person/42') {
            return Response.json({
                id: 42,
                name: 'Актёр',
                movies: [ {
                    id: 100,
                    name: 'Базовое название',
                    enProfession: 'actor',
                    description: 'Свежая роль',
                } ],
            });
        }
        return Response.json({
            docs: [ {
                id: 100,
                name: 'Некорректное переопределение',
                year: '2020',
            } ],
        });
    };

    try {
        const loaded = await loadKinopoiskPerson('42');

        assert.equal(loaded?.complete, false);
        assert.equal(loaded?.profile.filmography[0]?.title, 'Базовое название');
        assert.equal(loaded?.profile.filmography[0]?.role, 'Свежая роль');
    } finally {
        globalThis.fetch = previousFetch;
        if (previousToken === undefined) delete process.env.KINOPOISK_DEV_TOKEN;
        else process.env.KINOPOISK_DEV_TOKEN = previousToken;
        if (previousBaseUrl === undefined) delete process.env.KINOPOISK_DEV_BASE_URL;
        else process.env.KINOPOISK_DEV_BASE_URL = previousBaseUrl;
    }
});

const malformedEnrichmentSummaries = [
    [ 'whitespace-padded raw ID', { id: ' 100 ' } ],
    [ 'raw name over limit before trim', { name: ` ${'x'.repeat(300)}` } ],
    [ 'empty titles', { name: ' ', alternativeName: '', enName: null } ],
    [ 'fractional year', { year: 2020.5 } ],
    [ 'out-of-range year', { year: 2201 } ],
    [ 'overlong type', { type: 'movie'.repeat(21) } ],
    [ 'overlong name', { name: 'x'.repeat(301) } ],
    [ 'overlong alternative name', { alternativeName: 'x'.repeat(301) } ],
    [ 'overlong English name', { enName: 'x'.repeat(301) } ],
    [ 'rating above range', { rating: { kp: 11 } } ],
    [ 'rating below range', { rating: { kp: -1 } } ],
    [ 'invalid preview URL', { poster: { previewUrl: 'ftp://example.com/poster.jpg' } } ],
    [ 'invalid poster URL', { poster: { url: 'ftp://example.com/poster.jpg' } } ],
    [ 'overlong preview URL', { poster: { previewUrl: `https://example.com/${'x'.repeat(2_049)}` } } ],
    [ 'overlong poster URL', { poster: { url: `https://example.com/${'x'.repeat(2_049)}` } } ],
] as const;

for (const [ caseName, malformedSummary ] of malformedEnrichmentSummaries) {
    test(`person loader excludes ${caseName} enrichment and keeps base filmography`, async () => {
        const previousFetch = globalThis.fetch;
        const previousToken = process.env.KINOPOISK_DEV_TOKEN;
        const previousBaseUrl = process.env.KINOPOISK_DEV_BASE_URL;

        process.env.KINOPOISK_DEV_TOKEN = 'test-token';
        process.env.KINOPOISK_DEV_BASE_URL = 'https://kinopoisk.test';
        globalThis.fetch = async (input) => {
            const url = new URL(String(input));
            if (url.pathname === '/v1.4/person/42') {
                return Response.json({
                    id: 42,
                    name: 'Актёр',
                    movies: [ {
                        id: 100,
                        name: 'Базовое название',
                        enProfession: 'actor',
                        description: 'Базовая роль',
                    } ],
                });
            }
            return Response.json({
                docs: [ {
                    id: 100,
                    name: 'Некорректное переопределение',
                    ...malformedSummary,
                } ],
            });
        };

        try {
            const loaded = await loadKinopoiskPerson('42');

            assert.equal(loaded?.complete, false);
            assert.equal(loaded?.profile.filmography[0]?.title, 'Базовое название');
            assert.equal(loaded?.profile.filmography[0]?.role, 'Базовая роль');
        } finally {
            globalThis.fetch = previousFetch;
            if (previousToken === undefined) delete process.env.KINOPOISK_DEV_TOKEN;
            else process.env.KINOPOISK_DEV_TOKEN = previousToken;
            if (previousBaseUrl === undefined) delete process.env.KINOPOISK_DEV_BASE_URL;
            else process.env.KINOPOISK_DEV_BASE_URL = previousBaseUrl;
        }
    });
}

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
                Object.assign(person, args.data);
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
        loadFresh: async () => ({ profile: cachedProfile, complete: true }),
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
            complete: false,
            profile: {
                ...cachedProfile,
                name: 'Обновлённое имя',
                filmography: [],
            },
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

test('partial refresh merges cached enrichment by external ID without extending TTL', async () => {
    const staleUpdatedAt = new Date('2026-08-10T12:00:00.000Z');
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
        profileUpdatedAt: staleUpdatedAt,
    });
    const partialProfile: PersonProfile = {
        ...cachedProfile,
        filmography: [
            {
                externalId: '100',
                title: 'Свежая база',
                originalTitle: null,
                year: null,
                posterUrl: null,
                type: null,
                rating: null,
                role: 'Свежая роль',
            },
            {
                externalId: '200',
                title: 'Новая работа',
                originalTitle: null,
                year: null,
                posterUrl: null,
                type: null,
                rating: null,
                role: 'Камео',
            },
        ],
    };

    const result = await resolvePersonProfile({
        personId: 'person-local-42',
        store,
        now: NOW,
        loadFresh: async () => ({ profile: partialProfile, complete: false }),
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.source, 'partial-provider');
    assert.deepEqual(result.person.filmography[0], {
        ...cachedProfile.filmography[0],
        title: 'Свежая база',
        role: 'Свежая роль',
        localMovieId: 'local-100',
    });
    assert.deepEqual(result.person.filmography[1], partialProfile.filmography[1]);
    const update = calls.updates[0] as { data?: { filmography?: unknown; profileUpdatedAt?: unknown } };
    assert.deepEqual(update.data?.filmography, [
        {
            ...cachedProfile.filmography[0],
            title: 'Свежая база',
            role: 'Свежая роль',
        },
        partialProfile.filmography[1],
    ]);
    assert.equal(update.data?.profileUpdatedAt, staleUpdatedAt);
});

test('partial first refresh is displayable but does not create a fresh TTL', async () => {
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
        loadFresh: async () => ({ profile: cachedProfile, complete: false }),
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.source, 'partial-provider');
    assert.equal(result.person.filmography[0]?.title, 'Старый фильм');
    const update = calls.updates[0] as { data?: { profileUpdatedAt?: unknown } };
    assert.equal(update.data?.profileUpdatedAt, null);
});

test('partial refresh clears TTL when cached filmography JSON is invalid and retries next request', async () => {
    const recentlyUpdatedAt = new Date('2026-08-19T12:00:00.000Z');
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
        filmography: { malformed: true },
        profileUpdatedAt: recentlyUpdatedAt,
    });
    let loads = 0;
    const loadFresh = async () => {
        loads += 1;
        return { profile: cachedProfile, complete: false };
    };

    const first = await resolvePersonProfile({
        personId: 'person-local-42',
        store,
        now: NOW,
        loadFresh,
    });
    const second = await resolvePersonProfile({
        personId: 'person-local-42',
        store,
        now: NOW,
        loadFresh,
    });

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(loads, 2);
    assert.equal((calls.updates[0] as { data?: { profileUpdatedAt?: unknown } }).data?.profileUpdatedAt, null);
    assert.equal((calls.updates[1] as { data?: { profileUpdatedAt?: unknown } }).data?.profileUpdatedAt, null);
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

test('provider refresh recovers a profile with malformed persisted fields', async () => {
    const malformedPerson = {
        id: 'person-local-42',
        provider: 'kinopoisk-dev',
        externalId: '42',
        name: 'Компактное имя',
        originalName: 'Compact Name',
        photoUrl: 'not-a-url',
        sex: null,
        growthCm: null,
        birthDate: null,
        deathDate: null,
        birthPlace: [],
        professions: [ 'actor' ],
        facts: [],
        filmography: cachedProfile.filmography,
        profileUpdatedAt: new Date('2026-08-19T12:00:00.000Z'),
    };
    const { calls, store } = createStore(malformedPerson);
    let loads = 0;

    const result = await resolvePersonProfile({
        personId: 'person-local-42',
        store,
        now: NOW,
        loadFresh: async () => {
            loads += 1;
            return { profile: cachedProfile, complete: true };
        },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(loads, 1);
    assert.equal(result.source, 'provider');
    assert.equal(result.person.photoUrl, cachedProfile.photoUrl);
    assert.equal(calls.updates.length, 1);
    assert.equal(malformedPerson.photoUrl, cachedProfile.photoUrl);
    assert.equal(malformedPerson.profileUpdatedAt, NOW);
});

test('failed recovery does not return malformed persisted profile', async () => {
    const malformedPerson = {
        id: 'person-local-42',
        provider: 'kinopoisk-dev',
        externalId: '42',
        name: 'Компактное имя',
        originalName: null,
        photoUrl: 'not-a-url',
        sex: null,
        growthCm: null,
        birthDate: null,
        deathDate: null,
        birthPlace: [],
        professions: [],
        facts: [],
        filmography: cachedProfile.filmography,
        profileUpdatedAt: new Date('2026-08-19T12:00:00.000Z'),
    };
    const { calls, store } = createStore(malformedPerson);
    let loads = 0;

    const result = await resolvePersonProfile({
        personId: 'person-local-42',
        store,
        now: NOW,
        loadFresh: async () => {
            loads += 1;
            return null;
        },
    });

    assert.equal(loads, 1);
    assert.deepEqual(result, {
        ok: false,
        error: 'Профиль персоны временно недоступен',
    });
    assert.deepEqual(calls.updates, []);
});
