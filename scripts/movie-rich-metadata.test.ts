import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    mergeExternalRatings,
    normalizeCastSnapshot,
    normalizeExternalRatings,
} from '../src/lib/movie-rich-metadata';
import {
    writeMovieRichMetadata,
    type MovieRichMetadataWriter,
} from '../src/server/movie-rich-metadata';
import { movieFieldsSchema } from '../src/server/movies';

function createWriter() {
    const calls = {
        events: [] as string[],
        movieUpdates: [] as Array<{ where: { id: string }; data: Record<string, unknown> }>,
        personUpserts: [] as Array<Record<string, unknown>>,
        creditDeletes: [] as Array<Record<string, unknown>>,
        creditCreates: [] as Array<Record<string, unknown>>,
        videoDeletes: [] as Array<Record<string, unknown>>,
        videoCreates: [] as Array<{ data: Array<Record<string, unknown>> }>,
    };
    const tx: MovieRichMetadataWriter = {
        movie: {
            update: async (args) => {
                calls.events.push('movie.update');
                calls.movieUpdates.push(args);
                return {};
            },
        },
        person: {
            upsert: async (args) => {
                calls.events.push('person.upsert');
                calls.personUpserts.push(args);
                return { id: `person-${args.where.provider_externalId.externalId}` };
            },
        },
        moviePersonCredit: {
            deleteMany: async (args) => {
                calls.events.push('credit.deleteMany');
                calls.creditDeletes.push(args);
                return { count: 0 };
            },
            createMany: async (args) => {
                calls.events.push('credit.createMany');
                calls.creditCreates.push(args);
                return { count: args.data.length };
            },
        },
        movieVideo: {
            deleteMany: async (args) => {
                calls.events.push('video.deleteMany');
                calls.videoDeletes.push(args);
                return { count: 0 };
            },
            createMany: async (args) => {
                calls.events.push('video.createMany');
                calls.videoCreates.push(args);
                return { count: args.data.length };
            },
        },
    };

    return { calls, tx };
}

const cast = [
    {
        provider: 'kinopoisk-dev' as const,
        externalId: '10',
        name: 'Первый актёр',
        originalName: 'First Actor',
        photoUrl: 'https://example.com/first.jpg',
        profession: 'actor' as const,
        role: 'Герой',
        order: 1,
    },
    {
        provider: 'kinopoisk-dev' as const,
        externalId: '20',
        name: 'Второй актёр',
        originalName: null,
        photoUrl: null,
        profession: 'actor' as const,
        role: null,
        order: 0,
    },
];

const videos = [ {
    provider: 'kinopoisk-unofficial' as const,
    site: 'YOUTUBE',
    title: 'Трейлер',
    kind: 'TRAILER' as const,
    url: 'https://www.youtube.com/watch?v=abc123def45',
    position: 0,
} ];

test('feature migration drops the temporary review timestamp default and adds refresh attempts', () => {
    const migration = readFileSync(
        'prisma/migrations/20260820200000_movie_people_reviews/migration.sql',
        'utf8',
    );
    const schema = readFileSync('prisma/schema.prisma', 'utf8');

    assert.match(
        migration,
        /UPDATE "Comment" SET "updatedAt" = "createdAt";\s+ALTER TABLE "Comment" ALTER COLUMN "updatedAt" DROP DEFAULT;/,
    );
    assert.match(
        migration,
        /ALTER TABLE "Movie" ALTER COLUMN "episodesPerSeason" DROP DEFAULT;/,
    );
    assert.match(
        migration,
        /ALTER TABLE "ChatThread" ALTER COLUMN "updatedAt" DROP DEFAULT;/,
    );
    assert.match(
        migration,
        /"profileRefreshAttemptedAt" TIMESTAMP\(3\)/,
    );
    assert.match(
        schema,
        /profileRefreshAttemptedAt\s+DateTime\?/,
    );
});

test('movie RPC schema enforces provider-specific metadata IDs', () => {
    const fields = {
        title: 'Фильм',
        year: 2026,
        country: 'Россия',
        description: 'Описание',
    };

    for (const metadataExternalId of [ ' 42', '+42', '0', '01', '42x', '9007199254740992' ]) {
        assert.equal(movieFieldsSchema.safeParse({
            ...fields,
            metadataProvider: 'kinopoisk-dev',
            metadataExternalId,
        }).success, false, metadataExternalId);
    }
    assert.equal(movieFieldsSchema.safeParse({
        ...fields,
        metadataProvider: 'kinopoisk-unofficial',
        metadataExternalId: '42',
    }).success, true);
    assert.equal(movieFieldsSchema.safeParse({
        ...fields,
        metadataProvider: 'wikidata',
        metadataExternalId: 'Q42',
    }).success, true);
});

test('movie RPC schema retains validated automatic video metadata', () => {
    const fields = movieFieldsSchema.parse({
        title: 'Фильм',
        year: 2026,
        country: 'Россия',
        description: 'Описание',
        videos,
    });

    assert.deepEqual(fields.videos, videos);
    assert.equal(movieFieldsSchema.safeParse({
        title: 'Фильм',
        year: 2026,
        country: 'Россия',
        description: 'Описание',
        videos: [ { ...videos[0], url: 'javascript:alert(1)' } ],
    }).success, false);
});

test('normalizes valid ratings and removes invalid score or vote values', () => {
    assert.deepEqual(normalizeExternalRatings({
        kinopoisk: { value: 85, votes: 100 },
        imdb: { value: 42, votes: 200 },
        russianCritics: { value: 85, votes: 5 },
    }), {
        kinopoisk: null,
        imdb: null,
        russianCritics: { value: 85, votes: 5 },
    });
});

test('deduplicates cast by provider identity and preserves source order', () => {
    assert.deepEqual(normalizeCastSnapshot([
        {
            provider: 'kinopoisk-dev',
            externalId: '2',
            name: 'Второй',
            originalName: null,
            photoUrl: null,
            profession: 'actor',
            role: null,
            order: 1,
        },
        {
            provider: 'kinopoisk-dev',
            externalId: '1',
            name: 'Первый',
            originalName: null,
            photoUrl: null,
            profession: 'actor',
            role: 'Роль',
            order: 0,
        },
        {
            provider: 'kinopoisk-dev',
            externalId: '2',
            name: 'Дубликат',
            originalName: null,
            photoUrl: null,
            profession: 'actor',
            role: null,
            order: 2,
        },
    ]), [
        {
            provider: 'kinopoisk-dev',
            externalId: '1',
            name: 'Первый',
            originalName: null,
            photoUrl: null,
            profession: 'actor',
            role: 'Роль',
            order: 0,
        },
        {
            provider: 'kinopoisk-dev',
            externalId: '2',
            name: 'Второй',
            originalName: null,
            photoUrl: null,
            profession: 'actor',
            role: null,
            order: 1,
        },
    ]);
});

test('partial rating refresh preserves existing provider values', () => {
    assert.deepEqual(mergeExternalRatings(
        {
            kinopoisk: { value: 7.8, votes: 100 },
            imdb: { value: 8.1, votes: 200 },
            russianCritics: { value: 70, votes: 10 },
        },
        {
            kinopoisk: { value: 85, votes: 110 },
            imdb: { value: 42, votes: 210 },
            russianCritics: { value: 85, votes: 12 },
        },
    ), {
        kinopoisk: { value: 7.8, votes: 100 },
        imdb: { value: 8.1, votes: 200 },
        russianCritics: { value: 85, votes: 12 },
    });
});

test('rich metadata writer skips invalid ten-point ratings and saves valid critic percent', async () => {
    const { calls, tx } = createWriter();

    await writeMovieRichMetadata(tx, 'movie-1', {
        importSucceeded: true,
        externalRatings: {
            kinopoisk: { value: 85, votes: 100 },
            imdb: { value: 42, votes: 200 },
            russianCritics: { value: 85, votes: 12 },
        },
    });

    assert.deepEqual(calls.movieUpdates, [ {
        where: { id: 'movie-1' },
        data: {
            russianCriticsPercent: 85,
            russianCriticsVotes: 12,
        },
    } ]);
});

test('rich metadata writer does nothing after a failed detailed import', async () => {
    const { calls, tx } = createWriter();

    await writeMovieRichMetadata(tx, 'movie-1', {
        importSucceeded: false,
        externalRatings: { kinopoisk: { value: 7.8, votes: 100 }, imdb: null, russianCritics: null },
        cast,
    });

    assert.deepEqual(calls.events, []);
});

test('rich metadata writer replaces a non-empty automatic video snapshot', async () => {
    const { calls, tx } = createWriter();

    await writeMovieRichMetadata(tx, 'movie-1', {
        importSucceeded: true,
        videos,
    });

    assert.deepEqual(calls.videoDeletes, [ { where: { movieId: 'movie-1' } } ]);
    assert.deepEqual(calls.videoCreates, [ {
        data: [ {
            movieId: 'movie-1',
            provider: 'kinopoisk-unofficial',
            site: 'YOUTUBE',
            title: 'Трейлер',
            kind: 'TRAILER',
            url: 'https://www.youtube.com/watch?v=abc123def45',
            position: 0,
        } ],
    } ]);
});

test('empty automatic video refresh preserves the previous snapshot', async () => {
    const { calls, tx } = createWriter();

    await writeMovieRichMetadata(tx, 'movie-1', {
        importSucceeded: true,
        videos: [],
    });

    assert.deepEqual(calls.videoDeletes, []);
    assert.deepEqual(calls.videoCreates, []);
});

test('rich metadata writer updates only non-null rating fields and preserves empty cast', async () => {
    const { calls, tx } = createWriter();

    await writeMovieRichMetadata(tx, 'movie-1', {
        importSucceeded: true,
        externalRatings: {
            kinopoisk: { value: 7.8, votes: null },
            imdb: null,
            russianCritics: { value: 80, votes: 12 },
        },
        cast: [],
    });

    assert.deepEqual(calls.movieUpdates, [ {
        where: { id: 'movie-1' },
        data: {
            kinopoiskRating: 7.8,
            russianCriticsPercent: 80,
            russianCriticsVotes: 12,
        },
    } ]);
    assert.deepEqual(calls.creditDeletes, []);
    assert.deepEqual(calls.creditCreates, []);
});

test('valid cast upserts compact people and replaces ordered credits', async () => {
    const { calls, tx } = createWriter();

    await writeMovieRichMetadata(tx, 'movie-1', {
        importSucceeded: true,
        cast,
    });

    assert.deepEqual(calls.events, [
        'person.upsert',
        'person.upsert',
        'credit.deleteMany',
        'credit.createMany',
    ]);
    assert.deepEqual(calls.personUpserts, [
        {
            where: { provider_externalId: { provider: 'kinopoisk-dev', externalId: '20' } },
            create: {
                provider: 'kinopoisk-dev',
                externalId: '20',
                name: 'Второй актёр',
                originalName: null,
                photoUrl: null,
                professions: [ 'actor' ],
                birthPlace: [],
                facts: [],
            },
            update: {
                name: 'Второй актёр',
            },
            select: { id: true },
        },
        {
            where: { provider_externalId: { provider: 'kinopoisk-dev', externalId: '10' } },
            create: {
                provider: 'kinopoisk-dev',
                externalId: '10',
                name: 'Первый актёр',
                originalName: 'First Actor',
                photoUrl: 'https://example.com/first.jpg',
                professions: [ 'actor' ],
                birthPlace: [],
                facts: [],
            },
            update: {
                name: 'Первый актёр',
                originalName: 'First Actor',
                photoUrl: 'https://example.com/first.jpg',
            },
            select: { id: true },
        },
    ]);
    assert.deepEqual(calls.creditDeletes, [ { where: { movieId: 'movie-1' } } ]);
    assert.deepEqual(calls.creditCreates, [ {
        data: [
            { movieId: 'movie-1', personId: 'person-20', profession: 'actor', role: null, position: 0 },
            { movieId: 'movie-1', personId: 'person-10', profession: 'actor', role: 'Герой', position: 1 },
        ],
    } ]);
});

test('partial cast updates preserve nullable person identity fields', async () => {
    const { calls, tx } = createWriter();

    await writeMovieRichMetadata(tx, 'movie-1', {
        importSucceeded: true,
        cast,
    });

    const partialUpdate = calls.personUpserts[0]?.update as Record<string, unknown>;
    const completeUpdate = calls.personUpserts[1]?.update as Record<string, unknown>;

    assert.equal(Object.hasOwn(partialUpdate, 'originalName'), false);
    assert.equal(Object.hasOwn(partialUpdate, 'photoUrl'), false);
    assert.deepEqual(completeUpdate, {
        name: 'Первый актёр',
        originalName: 'First Actor',
        photoUrl: 'https://example.com/first.jpg',
    });
});

test('invalid direct cast IDs and blank names never create people', async () => {
    const { calls, tx } = createWriter();

    await writeMovieRichMetadata(tx, 'movie-1', {
        importSucceeded: true,
        cast: [
            { ...cast[0], externalId: '01' },
            { ...cast[0], externalId: ' 10' },
            { ...cast[0], name: '   ' },
        ],
    });

    assert.deepEqual(calls.personUpserts, []);
    assert.deepEqual(calls.creditDeletes, []);
});
