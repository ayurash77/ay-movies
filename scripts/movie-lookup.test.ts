import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    externalRatingsSchema,
    kinopoiskExternalIdSchema,
    lookupSourceSchema,
    movieCastMemberSchema,
    movieLookupCandidateSchema,
    movieLookupDetailsSchema,
    type MovieLookupCandidate,
    type MovieLookupDetails,
} from '../src/lib/movie-lookup-types';
import {
    hasUsableMovieLookupDetails,
    movieLookupFormMetadata,
    resolveMovieLookupDetails,
} from '../src/lib/movie-lookup-details';
import {
    mapKinopoiskMovie,
    mapKinopoiskRichMetadata,
    mapKinopoiskSeasons,
    loadKinopoiskCandidate,
} from '../src/server/movie-lookup-providers/kinopoisk-dev';
import {
    mapKinopoiskUnofficialMovie,
    mapKinopoiskUnofficialSeasons,
    loadKinopoiskUnofficialCandidate,
} from '../src/server/movie-lookup-providers/kinopoisk-unofficial';
import {
    buildLookupAttempts,
    claimSeriesInfo,
    claimSeriesParts,
    claimYear,
    isMediaEntity,
    type LookupWikidataEntity,
} from '../src/lib/movie-lookup-utils';

function entity(
    ids: string[],
    dates: Record<string, string[]> = {},
    quantities: Record<string, string[]> = {},
    parts: Array<{ id: string; ordinal: number }> = [],
): LookupWikidataEntity {
    return {
        claims: {
            P31: ids.map((id) => ({ mainsnak: { datavalue: { value: { id } } } })),
            P527: parts.map((part) => ({
                mainsnak: { datavalue: { value: { id: part.id } } },
                qualifiers: {
                    P1545: [
                        { datavalue: { value: String(part.ordinal) } },
                    ],
                },
            })),
            ...Object.fromEntries(
                Object.entries(dates).map(([ prop, values ]) => [
                    prop,
                    values.map((time) => ({ mainsnak: { datavalue: { value: { time } } } })),
                ]),
            ),
            ...Object.fromEntries(
                Object.entries(quantities).map(([ prop, values ]) => [
                    prop,
                    values.map((amount) => ({ mainsnak: { datavalue: { value: { amount, unit: '1' } } } })),
                ]),
            ),
        },
    };
}

test('movie lookup candidate schema accepts provider metadata', () => {
    const candidate: MovieLookupCandidate = {
        found: true,
        provider: 'kinopoisk-dev',
        providerLabel: 'Кинопоиск',
        externalId: '123',
        sourceUrl: 'https://www.kinopoisk.ru/film/123/',
        confidence: 92,
        rating: 8.4,
        kind: 'SERIES',
        title: 'Игра престолов',
        originalTitle: 'Game of Thrones',
        year: 2011,
        country: 'США, Великобритания',
        description: 'Описание',
        director: null,
        genres: [ 'драма', 'фэнтези' ],
        starring: [ 'Питер Динклэйдж' ],
        durationMin: 55,
        seasonsCount: 8,
        episodesPerSeason: [ 10, 10, 10, 10, 10, 10, 7, 6 ],
        posterUrl: 'https://example.com/poster.jpg',
    };

    assert.deepEqual(movieLookupCandidateSchema.parse(candidate), candidate);
});

test('external rating schema enforces provider-specific ranges', () => {
    assert.equal(externalRatingsSchema.safeParse({
        kinopoisk: { value: 10, votes: 1 },
        imdb: { value: 0, votes: 2 },
        russianCritics: { value: 100, votes: 3 },
    }).success, true);
    assert.equal(externalRatingsSchema.safeParse({
        kinopoisk: { value: 85, votes: 1 },
        imdb: { value: 42, votes: 2 },
        russianCritics: { value: 85, votes: 3 },
    }).success, false);
});

test('Kinopoisk IDs are canonical positive safe decimal strings', () => {
    assert.equal(kinopoiskExternalIdSchema.parse('9007199254740991'), '9007199254740991');
    for (const externalId of [
        '', ' 1', '1 ', '+1', '-1', '0', '01', '1x', '9007199254740992',
    ]) {
        assert.equal(kinopoiskExternalIdSchema.safeParse(externalId).success, false, externalId);
        for (const provider of [ 'kinopoisk-dev', 'kinopoisk-unofficial' ] as const) {
            assert.equal(lookupSourceSchema.safeParse({ provider, externalId }).success, false);
        }
    }

    assert.equal(lookupSourceSchema.safeParse({
        provider: 'wikidata',
        externalId: 'Q42',
    }).success, true);
});

test('direct candidate and cast schemas reject malicious IDs and normalize names', () => {
    const candidate = {
        found: true,
        provider: 'kinopoisk-dev' as const,
        providerLabel: 'Кинопоиск',
        externalId: ' 42',
    };
    assert.equal(movieLookupCandidateSchema.safeParse(candidate).success, false);

    const parsed = movieCastMemberSchema.parse({
        provider: 'kinopoisk-dev',
        externalId: '42',
        name: '  Актёр  ',
        originalName: '   ',
        photoUrl: null,
        profession: 'actor',
        role: '  Герой  ',
        order: 0,
    });
    assert.equal(parsed.name, 'Актёр');
    assert.equal(parsed.originalName, null);
    assert.equal(parsed.role, 'Герой');
    assert.equal(movieCastMemberSchema.safeParse({
        ...parsed,
        externalId: '01',
    }).success, false);
    assert.equal(movieCastMemberSchema.safeParse({
        ...parsed,
        name: '   ',
    }).success, false);
});

test('movie lookup exposes candidate entrypoint and keeps compatibility wrapper', () => {
    const source = readFileSync('src/server/movie-lookup.ts', 'utf8');

    assert.match(source, /lookupMovieCandidates/);
    assert.match(source, /lookupWikidataCandidates/);
    assert.match(source, /lookupMovie = createServerFn/);
    assert.match(source, /candidates\[0\]/);
});

test('kinopoisk mapper normalizes series metadata', () => {
    const candidate = mapKinopoiskMovie({
        id: 464963,
        type: 'tv-series',
        name: 'Игра престолов',
        alternativeName: 'Game of Thrones',
        year: 2011,
        description: 'Борьба за Железный трон.',
        shortDescription: null,
        movieLength: 55,
        rating: { kp: 9.0 },
        poster: { previewUrl: 'https://example.com/got.jpg', url: 'https://example.com/got-full.jpg' },
        countries: [ { name: 'США' }, { name: 'Великобритания' } ],
        genres: [ { name: 'драма' }, { name: 'фэнтези' } ],
        persons: [
            { name: 'Дэвид Бениофф', profession: 'режиссеры', enProfession: 'director' },
            { name: 'Питер Динклэйдж', profession: 'актеры', enProfession: 'actor' },
        ],
    }, [ 10, 10, 10, 10, 10, 10, 7, 6 ]);

    assert.equal(candidate?.provider, 'kinopoisk-dev');
    assert.equal(candidate?.kind, 'SERIES');
    assert.equal(candidate?.title, 'Игра престолов');
    assert.equal(candidate?.originalTitle, 'Game of Thrones');
    assert.equal(candidate?.country, 'США, Великобритания');
    assert.deepEqual(candidate?.episodesPerSeason, [ 10, 10, 10, 10, 10, 10, 7, 6 ]);
    assert.equal(candidate?.seasonsCount, 8);
    assert.equal(candidate?.sourceUrl, 'https://www.kinopoisk.ru/film/464963/');
});

test('kinopoisk mapper detects cartoons from type and genres', () => {
    const candidate = mapKinopoiskMovie({
        id: 1,
        type: 'cartoon',
        name: 'ВАЛЛ-И',
        alternativeName: 'WALL-E',
        year: 2008,
        genres: [ { name: 'мультфильм' }, { name: 'фантастика' } ],
        countries: [],
        persons: [],
    });

    assert.equal(candidate?.kind, 'CARTOON');
});

test('kinopoisk details map ratings, votes, and rich cast', () => {
    const rich = mapKinopoiskRichMetadata({
        id: 1331649,
        rating: { kp: 7.894, imdb: 8.3, russianFilmCritics: 100 },
        votes: { kp: 42572, imdb: 144000, russianFilmCritics: 7 },
        persons: [ {
            id: 2341341,
            name: 'Джек Лауден',
            enName: 'Jack Lowden',
            photo: 'https://example.com/jack.jpg',
            profession: 'актеры',
            enProfession: 'actor',
            description: 'River Cartwright',
        } ],
    });

    assert.deepEqual(rich.externalRatings, {
        kinopoisk: { value: 7.894, votes: 42572 },
        imdb: { value: 8.3, votes: 144000 },
        russianCritics: { value: 100, votes: 7 },
    });
    assert.deepEqual(rich.cast[0], {
        provider: 'kinopoisk-dev',
        externalId: '2341341',
        name: 'Джек Лауден',
        originalName: 'Jack Lowden',
        photoUrl: 'https://example.com/jack.jpg',
        profession: 'actor',
        role: 'River Cartwright',
        order: 0,
    });
});

test('kinopoisk rich metadata rejects invalid fields and duplicate cast', () => {
    const rich = mapKinopoiskRichMetadata({
        rating: { kp: 85, imdb: 42, russianFilmCritics: 85 },
        votes: { kp: 10, imdb: 20, russianFilmCritics: 30 },
        persons: [
            { id: 1, name: 'Первый актер', enProfession: 'actor', photo: 'ftp://example.com/first.jpg' },
            { id: 1, name: 'Дубликат', enProfession: 'actor', photo: 'https://example.com/duplicate.jpg' },
            { id: 2, name: 'Режиссер', enProfession: 'director' },
            { id: null, name: 'Без идентификатора', enProfession: 'actor' },
            ...Array.from({ length: 101 }, (_, index) => ({
                id: index + 10,
                name: `Актер ${index + 10}`,
                enProfession: 'actor',
            })),
        ],
    });

    assert.deepEqual(rich.externalRatings, {
        kinopoisk: null,
        imdb: null,
        russianCritics: { value: 85, votes: 30 },
    });
    assert.equal(rich.cast.length, 100);
    assert.deepEqual(rich.cast[0], {
        provider: 'kinopoisk-dev',
        externalId: '1',
        name: 'Первый актер',
        originalName: null,
        photoUrl: null,
        profession: 'actor',
        role: null,
        order: 0,
    });
    assert.equal(rich.cast.at(-1)?.externalId, '108');
});

test('kinopoisk rich metadata rejects invalid string person ids', () => {
    for (const id of [ 'abc', '0', '-1' ]) {
        const rich = mapKinopoiskRichMetadata({
            persons: [ { id, name: `Некорректный ID ${id}`, enProfession: 'actor' } ],
        });

        assert.deepEqual(rich.cast, [], `person id ${id} must be rejected`);
    }
});

test('kinopoisk detail enriches cast roles in batches while preserving cast order', async () => {
    const previousFetch = globalThis.fetch;
    const previousToken = process.env.KINOPOISK_DEV_TOKEN;
    const personRequests: URL[] = [];
    process.env.KINOPOISK_DEV_TOKEN = 'test-token';
    globalThis.fetch = async (input) => {
        const url = new URL(String(input));

        if (url.pathname === '/v1.4/movie/123') {
            return Response.json({
                id: 123,
                name: 'Тестовый фильм',
                persons: Array.from({ length: 11 }, (_, index) => ({
                    id: index + 1,
                    name: `Актер ${index + 1}`,
                    enProfession: 'actor',
                    description: null,
                })),
            });
        }
        if (url.pathname === '/v1.4/season') return Response.json({ docs: [] });
        if (url.pathname === '/v1.4/person') {
            personRequests.push(url);
            const ids = url.searchParams.getAll('id');
            return Response.json({
                docs: ids.reverse().map((id) => ({
                    id,
                    name: `Актер ${id}`,
                    movies: [
                        {
                            id: 123,
                            enProfession: 'producer',
                            description: `Не роль ${id}`,
                        },
                        {
                            id: 123,
                            enProfession: 'actor',
                            description: `Персонаж ${id}`,
                        },
                    ],
                })),
            });
        }

        throw new Error(`Unexpected Kinopoisk URL: ${url}`);
    };

    try {
        const details = await loadKinopoiskCandidate('123');

        assert.equal(personRequests.length, 2);
        assert.equal(personRequests[0]?.searchParams.getAll('id').length, 10);
        assert.equal(personRequests[1]?.searchParams.getAll('id').length, 1);
        assert.deepEqual(personRequests[0]?.searchParams.getAll('selectFields'), [ 'id', 'movies' ]);
        assert.deepEqual(personRequests[1]?.searchParams.getAll('selectFields'), [ 'id', 'movies' ]);
        assert.deepEqual(
            details?.cast.map(({ externalId, role }) => ({ externalId, role })),
            Array.from({ length: 11 }, (_, index) => ({
                externalId: String(index + 1),
                role: `Персонаж ${index + 1}`,
            })),
        );
    } finally {
        globalThis.fetch = previousFetch;
        if (previousToken === undefined) delete process.env.KINOPOISK_DEV_TOKEN;
        else process.env.KINOPOISK_DEV_TOKEN = previousToken;
    }
});

test('kinopoisk detail falls back when person role payload is malformed', async () => {
    const previousFetch = globalThis.fetch;
    const previousToken = process.env.KINOPOISK_DEV_TOKEN;
    const malformedResponses = [
        Response.json({ docs: {} }),
        Response.json({ docs: [ { id: 1, movies: {} } ] }),
    ];
    let personRequests = 0;
    process.env.KINOPOISK_DEV_TOKEN = 'test-token';
    globalThis.fetch = async (input) => {
        const url = new URL(String(input));

        if (url.pathname === '/v1.4/movie/123') {
            return Response.json({
                id: 123,
                name: 'Тестовый фильм',
                rating: { kp: 8.1 },
                votes: { kp: 12 },
                persons: [ {
                    id: 1,
                    name: 'Актер 1',
                    enProfession: 'actor',
                    description: null,
                } ],
            });
        }
        if (url.pathname === '/v1.4/season') return Response.json({ docs: [] });
        if (url.pathname === '/v1.4/person') return malformedResponses[personRequests++];

        throw new Error(`Unexpected Kinopoisk URL: ${url}`);
    };

    try {
        for (let attempt = 0; attempt < malformedResponses.length; attempt++) {
            const details = await loadKinopoiskCandidate('123');

            assert.equal(details?.title, 'Тестовый фильм');
            assert.deepEqual(details?.seasons, []);
            assert.deepEqual(details?.externalRatings, {
                kinopoisk: { value: 8.1, votes: 12 },
                imdb: null,
                russianCritics: null,
            });
            assert.deepEqual(details?.cast.map(({ externalId, role }) => ({ externalId, role })), [ {
                externalId: '1',
                role: null,
            } ]);
        }
    } finally {
        globalThis.fetch = previousFetch;
        if (previousToken === undefined) delete process.env.KINOPOISK_DEV_TOKEN;
        else process.env.KINOPOISK_DEV_TOKEN = previousToken;
    }
});

test('kinopoisk detail keeps movie data when cast role enrichment fails', async () => {
    const previousFetch = globalThis.fetch;
    const previousToken = process.env.KINOPOISK_DEV_TOKEN;
    process.env.KINOPOISK_DEV_TOKEN = 'test-token';
    globalThis.fetch = async (input) => {
        const url = new URL(String(input));

        if (url.pathname === '/v1.4/movie/123') {
            return Response.json({
                id: 123,
                name: 'Тестовый фильм',
                rating: { kp: 8.1 },
                votes: { kp: 12 },
                persons: [ {
                    id: 1,
                    name: 'Актер 1',
                    enProfession: 'actor',
                    description: null,
                } ],
            });
        }
        if (url.pathname === '/v1.4/season') return Response.json({ docs: [] });
        if (url.pathname === '/v1.4/person') return new Response(null, { status: 503 });

        throw new Error(`Unexpected Kinopoisk URL: ${url}`);
    };

    try {
        const details = await loadKinopoiskCandidate('123');

        assert.equal(details?.title, 'Тестовый фильм');
        assert.deepEqual(details?.seasons, []);
        assert.deepEqual(details?.externalRatings, {
            kinopoisk: { value: 8.1, votes: 12 },
            imdb: null,
            russianCritics: null,
        });
        assert.deepEqual(details?.cast.map(({ externalId, role }) => ({ externalId, role })), [ {
            externalId: '1',
            role: null,
        } ]);
    } finally {
        globalThis.fetch = previousFetch;
        if (previousToken === undefined) delete process.env.KINOPOISK_DEV_TOKEN;
        else process.env.KINOPOISK_DEV_TOKEN = previousToken;
    }
});

test('kinopoisk detailed season mapper preserves localized episode metadata', () => {
    assert.deepEqual(mapKinopoiskSeasons([
        {
            number: 1,
            name: 'Первый сезон',
            enName: 'Season One',
            episodes: [ {
                number: 1,
                name: 'Недотепство заразно',
                enName: "Failure's Contagious",
                description: 'Ривер прибывает в Слау-Хаус.',
                airDate: '2022-04-01',
                still: { url: 'https://example.com/episode.jpg' },
            } ],
        },
    ]), [ {
        number: 1,
        name: 'Первый сезон',
        originalName: 'Season One',
        description: null,
        originalDescription: null,
        airDate: null,
        durationMin: null,
        posterUrl: null,
        episodes: [ {
            number: 1,
            name: 'Недотепство заразно',
            originalName: "Failure's Contagious",
            description: 'Ривер прибывает в Слау-Хаус.',
            originalDescription: null,
            airDate: '2022-04-01',
            stillUrl: 'https://example.com/episode.jpg',
        } ],
    } ]);
});

test('kinopoisk detailed season mapper orders episodes by number', () => {
    const seasons = mapKinopoiskSeasons([ {
        number: 1,
        episodes: [
            { number: 2, name: 'Вторая серия' },
            { number: 1, name: 'Первая серия' },
        ],
    } ]);

    assert.deepEqual(seasons[0]?.episodes.map((episode) => episode.number), [ 1, 2 ]);
});

test('kinopoisk unofficial mapper normalizes detailed series metadata', () => {
    const candidate = mapKinopoiskUnofficialMovie({
        kinopoiskId: 464963,
        type: 'TV_SERIES',
        nameRu: 'Игра престолов',
        nameOriginal: 'Game of Thrones',
        year: 2011,
        description: 'Борьба за Железный трон.',
        filmLength: 55,
        ratingKinopoisk: 9.0,
        webUrl: 'https://www.kinopoisk.ru/series/464963/',
        posterUrlPreview: 'https://example.com/got-small.jpg',
        posterUrl: 'https://example.com/got.jpg',
        countries: [ { country: 'США' }, { country: 'Великобритания' } ],
        genres: [ { genre: 'драма' }, { genre: 'фэнтези' } ],
    }, [
        { nameRu: 'Дэвид Бениофф', professionKey: 'DIRECTOR' },
        { nameRu: 'Питер Динклэйдж', professionKey: 'ACTOR' },
    ], [ 10, 10, 10, 10, 10, 10, 7, 6 ]);

    assert.equal(candidate?.provider, 'kinopoisk-unofficial');
    assert.equal(candidate?.kind, 'SERIES');
    assert.equal(candidate?.title, 'Игра престолов');
    assert.equal(candidate?.originalTitle, 'Game of Thrones');
    assert.equal(candidate?.country, 'США, Великобритания');
    assert.equal(candidate?.director, 'Дэвид Бениофф');
    assert.deepEqual(candidate?.starring, [ 'Питер Динклэйдж' ]);
    assert.deepEqual(candidate?.episodesPerSeason, [ 10, 10, 10, 10, 10, 10, 7, 6 ]);
    assert.equal(candidate?.seasonsCount, 8);
    assert.equal(candidate?.sourceUrl, 'https://www.kinopoisk.ru/series/464963/');
});

test('kinopoisk unofficial mapper detects cartoons from genres', () => {
    const candidate = mapKinopoiskUnofficialMovie({
        kinopoiskId: 1,
        type: 'FILM',
        nameRu: 'ВАЛЛ-И',
        nameOriginal: 'WALL-E',
        year: 2008,
        genres: [ { genre: 'мультфильм' }, { genre: 'фантастика' } ],
        countries: [],
    });

    assert.equal(candidate?.kind, 'CARTOON');
});

test('kinopoisk unofficial detailed season mapper preserves episode metadata', () => {
    assert.deepEqual(mapKinopoiskUnofficialSeasons([
        {
            number: 2,
            episodes: [ {
                seasonNumber: 2,
                episodeNumber: 3,
                nameRu: 'Новая серия',
                nameEn: 'A New Episode',
                synopsis: 'События принимают неожиданный оборот.',
                releaseDate: '2023-05-17',
            } ],
        },
    ]), [ {
        number: 2,
        name: null,
        originalName: null,
        description: null,
        originalDescription: null,
        airDate: null,
        durationMin: null,
        posterUrl: null,
        episodes: [ {
            number: 3,
            name: 'Новая серия',
            originalName: 'A New Episode',
            description: 'События принимают неожиданный оборот.',
            originalDescription: null,
            airDate: '2023-05-17',
            stillUrl: null,
        } ],
    } ]);
});

test('kinopoisk unofficial detailed season mapper orders episodes by number', () => {
    const seasons = mapKinopoiskUnofficialSeasons([ {
        number: 1,
        episodes: [
            { seasonNumber: 1, episodeNumber: 2, nameRu: 'Вторая серия' },
            { seasonNumber: 1, episodeNumber: 1, nameRu: 'Первая серия' },
        ],
    } ]);

    assert.deepEqual(seasons[0]?.episodes.map((episode) => episode.number), [ 1, 2 ]);
});

test('movie lookup exports authenticated detail loading with validated provider and external id', () => {
    const source = readFileSync('src/server/movie-lookup.ts', 'utf8');

    assert.match(source, /lookupDetailsInputSchema/);
    assert.match(source, /lookupDetailsInputSchema = lookupSourceSchema/);
    assert.match(source, /loadMovieLookupDetails\s*=\s*createServerFn/);
    assert.match(source, /data\.provider === 'wikidata'/);
    const detailsHandler = source.slice(source.indexOf('export const loadMovieLookupDetails'));
    assert.ok(
        detailsHandler.indexOf("data.provider === 'wikidata'")
            < detailsHandler.indexOf("import('./movie-lookup-providers/kinopoisk-dev')"),
    );
    assert.match(source, /\[ loadKinopoiskUnofficialCandidate, loadKinopoiskCandidate \]/);
    assert.match(source, /\[ loadKinopoiskCandidate, loadKinopoiskUnofficialCandidate \]/);
});

test('invalid Kinopoisk detail IDs never call either provider', async () => {
    const previousFetch = globalThis.fetch;
    const previousDevToken = process.env.KINOPOISK_DEV_TOKEN;
    const previousUnofficialToken = process.env.KINOPOISK_UNOFFICIAL_TOKEN;
    let fetches = 0;
    process.env.KINOPOISK_DEV_TOKEN = 'test-token';
    process.env.KINOPOISK_UNOFFICIAL_TOKEN = 'test-token';
    globalThis.fetch = async () => {
        fetches += 1;
        return Response.json({});
    };

    try {
        for (const externalId of [ ' 42', '+42', '0', '01', '42x', '9007199254740992' ]) {
            assert.equal(await loadKinopoiskCandidate(externalId), null);
            assert.equal(await loadKinopoiskUnofficialCandidate(externalId), null);
        }
        assert.equal(fetches, 0);
    } finally {
        globalThis.fetch = previousFetch;
        if (previousDevToken === undefined) delete process.env.KINOPOISK_DEV_TOKEN;
        else process.env.KINOPOISK_DEV_TOKEN = previousDevToken;
        if (previousUnofficialToken === undefined) delete process.env.KINOPOISK_UNOFFICIAL_TOKEN;
        else process.env.KINOPOISK_UNOFFICIAL_TOKEN = previousUnofficialToken;
    }
});

test('movie lookup rejects Wikidata entity ids before importing Kinopoisk loaders', () => {
    const source = readFileSync('src/server/movie-lookup.ts', 'utf8');
    const detailsHandler = source.slice(source.indexOf('export const loadMovieLookupDetails'));

    assert.match(detailsHandler, /isWikidataEntityId\(data\.externalId\)/);
    assert.ok(
        detailsHandler.indexOf('isWikidataEntityId(data.externalId)')
            < detailsHandler.indexOf("import('./movie-lookup-providers/kinopoisk-dev')"),
    );
});

test('detail dispatcher continues to fallback after a loader throws', async () => {
    const result = await resolveMovieLookupDetails('123', [
        async () => { throw new Error('provider unavailable'); },
        async () => detail('MOVIE', []),
    ]);

    assert.equal(result?.kind, 'MOVIE');
});

function detail(kind: 'MOVIE' | 'SERIES' | 'CARTOON', seasons: MovieLookupDetails['seasons']): MovieLookupDetails {
    return movieLookupDetailsSchema.parse({
        found: true,
        provider: 'kinopoisk-dev',
        providerLabel: 'Кинопоиск',
        externalId: '123',
        kind,
        title: 'Тест',
        seasons,
    });
}

test('detail dispatcher falls back after an empty series snapshot', async () => {
    const calls: string[] = [];
    const result = await resolveMovieLookupDetails('123', [
        async () => {
            calls.push('selected');
            return detail('SERIES', []);
        },
        async () => {
            calls.push('fallback');
            return detail('SERIES', [ {
                number: 1,
                episodes: [ { number: 1 } ],
            } ]);
        },
    ]);

    assert.deepEqual(calls, [ 'selected', 'fallback' ]);
    assert.equal(result?.seasons.length, 1);
});

test('detail dispatcher falls back after a season shell without episodes', async () => {
    const calls: string[] = [];
    const result = await resolveMovieLookupDetails('123', [
        async () => {
            calls.push('selected');
            return detail('SERIES', [ { number: 1, episodes: [] } ]);
        },
        async () => {
            calls.push('fallback');
            return detail('SERIES', [ {
                number: 1,
                episodes: [ { number: 1 } ],
            } ]);
        },
    ]);

    assert.deepEqual(calls, [ 'selected', 'fallback' ]);
    assert.equal(result?.seasons[0]?.episodes.length, 1);
});

test('shared detail predicate normalizes series snapshots before checking episodes', () => {
    assert.equal(hasUsableMovieLookupDetails(detail('MOVIE', [])), true);
    assert.equal(hasUsableMovieLookupDetails(detail('SERIES', [ {
        number: 1,
        episodes: [],
    } ])), false);
    assert.equal(hasUsableMovieLookupDetails(detail('SERIES', [ {
        number: 1,
        episodes: [ { number: 1 }, { number: 1 } ],
    } ])), true);
});

test('add and edit metadata application preserve snapshots after a season shell', () => {
    const previous = {
        seriesSeasons: [ { number: 2, episodes: [ { number: 3 } ] } ],
        externalRatings: {
            kinopoisk: { value: 8, votes: 100 },
            imdb: null,
            russianCritics: null,
        },
        cast: [ {
            provider: 'kinopoisk-dev' as const,
            externalId: '42',
            name: 'Актёр',
            originalName: null,
            photoUrl: null,
            profession: 'actor' as const,
            role: null,
            order: 0,
        } ],
    };
    const shell = detail('SERIES', [ { number: 1, episodes: [] } ]);

    assert.deepEqual(movieLookupFormMetadata(shell), {
        metadataImportSucceeded: false,
        seriesSeasons: undefined,
        externalRatings: undefined,
        cast: undefined,
    });
    assert.deepEqual(movieLookupFormMetadata(shell, previous), {
        metadataImportSucceeded: false,
        ...previous,
    });
});

test('detail dispatcher rejects when every series loader returns an empty snapshot', async () => {
    const result = await resolveMovieLookupDetails('123', [
        async () => detail('SERIES', []),
        async () => detail('SERIES', []),
    ]);

    assert.equal(result, null);
});

test('detail dispatcher accepts non-series details without seasons', async () => {
    const result = await resolveMovieLookupDetails('123', [
        async () => detail('MOVIE', []),
    ]);

    assert.equal(result?.kind, 'MOVIE');
});

test('provider searches do not load details for every candidate', () => {
    const kinopoiskSource = readFileSync('src/server/movie-lookup-providers/kinopoisk-dev.ts', 'utf8');
    const unofficialSource = readFileSync('src/server/movie-lookup-providers/kinopoisk-unofficial.ts', 'utf8');
    const kinopoiskSearch = kinopoiskSource.slice(
        kinopoiskSource.indexOf('export async function lookupKinopoiskCandidates'),
        kinopoiskSource.indexOf('export async function loadKinopoiskCandidate'),
    );
    const unofficialSearch = unofficialSource.slice(
        unofficialSource.indexOf('export async function lookupKinopoiskUnofficialCandidates'),
        unofficialSource.indexOf('export async function loadKinopoiskUnofficialCandidate'),
    );

    assert.doesNotMatch(kinopoiskSearch, /loadKinopoiskSeasons/);
    assert.doesNotMatch(unofficialSearch, /loadMovie|loadStaff|loadEpisodesPerSeason/);
});

test('movie lookup tries exact title before film suffix and includes series suffixes', () => {
    assert.deepEqual(buildLookupAttempts('медленные лошади').slice(0, 6), [
        [ 'ru', 'медленные лошади' ],
        [ 'ru', 'медленные лошади сериал' ],
        [ 'ru', 'медленные лошади фильм' ],
        [ 'en', 'медленные лошади' ],
        [ 'en', 'медленные лошади tv series' ],
        [ 'en', 'медленные лошади film' ],
    ]);
});

test('movie lookup accepts media entities and rejects people', () => {
    assert.equal(isMediaEntity(entity([ 'Q5398426' ]), ''), true);
    assert.equal(isMediaEntity(entity([ 'Q11424' ]), ''), true);
    assert.equal(isMediaEntity(entity([ 'Q5' ]), 'Паоло Соррентино'), false);
    assert.equal(isMediaEntity(entity([ 'Q4167410' ]), 'Игра престолов — книга и телесериал'), false);
});

test('movie lookup reads series start year when publication date is absent', () => {
    assert.equal(claimYear(entity([ 'Q5398426' ], { P580: [ '+2022-04-01T00:00:00Z' ] })), 2022);
});

test('movie lookup reads seasons and evenly distributed episode counts for series', () => {
    assert.deepEqual(
        claimSeriesInfo(entity([ 'Q5398426' ], {}, { P2437: [ '+5' ], P1113: [ '+30' ] })),
        { seasonsCount: 5, episodesPerSeason: [ 6, 6, 6, 6, 6 ] },
    );
});

test('movie lookup reads per-season episode counts from season items', () => {
    const series = entity([ 'Q5398426' ], {}, { P2437: [ '+8' ], P1113: [ '+73' ] }, [
        { id: 's1', ordinal: 1 },
        { id: 's2', ordinal: 2 },
        { id: 's3', ordinal: 3 },
        { id: 's4', ordinal: 4 },
        { id: 's5', ordinal: 5 },
        { id: 's6', ordinal: 6 },
        { id: 's7', ordinal: 7 },
        { id: 's8', ordinal: 8 },
    ]);
    const parts = claimSeriesParts(series);

    assert.deepEqual(parts.map((part) => part.ordinal), [ 1, 2, 3, 4, 5, 6, 7, 8 ]);
    assert.deepEqual(
        claimSeriesInfo(series, parts.map((part, index) => ({
            ...part,
            entity: entity([ 'Q3464665' ], {}, { P1113: [ `+${index < 6 ? 10 : index === 6 ? 7 : 6}` ] }),
        }))),
        { seasonsCount: 8, episodesPerSeason: [ 10, 10, 10, 10, 10, 10, 7, 6 ] },
    );
});
