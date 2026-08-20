import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import {
    movieKindOptions,
    movieSortDirOptions,
    movieSortOptions,
    type HomeMovies,
    type MovieCardData,
    type MovieDetails,
    type MovieSearchPage,
    type MovieSort,
    type MovieSortDir,
} from '@/lib/movie-data';
import { GENRE_OPTIONS, normalizeGenre } from '@/lib/genre-groups';
import { buildMovieDedupeKey } from '@/lib/movie-dedupe';
import { toServedUploadUrl } from '@/lib/upload-url';

const MOVIE_PAGE_SIZE = 48;

async function getDb() {
    return (await import('@/lib/db')).db;
}

async function getAuthUser() {
    return (await import('./session')).getAuthUser();
}

export async function toMovieCards(ids: string[]): Promise<Map<string, MovieCardData>> {
    if (ids.length === 0) return new Map();
    const db = await getDb();

    const [ movies, aggregates, commentCounts ] = await Promise.all([
        db.movie.findMany({ where: { id: { in: ids } } }),
        db.rating.groupBy({
            by: [ 'movieId' ],
            where: { movieId: { in: ids } },
            _avg: { value: true },
            _count: { _all: true },
        }),
        db.comment.groupBy({
            by: [ 'movieId' ],
            where: { movieId: { in: ids } },
            _count: { _all: true },
        }),
    ]);

    const aggByMovie = new Map(aggregates.map((a) => [ a.movieId, a ]));
    const commentsByMovie = new Map(commentCounts.map((c) => [ c.movieId, c._count._all ]));

    return new Map(
        movies.map((movie) => {
            const agg = aggByMovie.get(movie.id);
            return [
                movie.id,
                {
                    id: movie.id,
                    kind: movie.kind,
                    title: movie.title,
                    year: movie.year,
                    country: movie.country,
                    genres: movie.genres,
                    posterUrl: toServedUploadUrl(movie.posterUrl),
                    seasonsCount: movie.seasonsCount,
                    episodesPerSeason: movie.episodesPerSeason,
                    avgRating: agg?._avg.value ?? 0,
                    ratingCount: agg?._count._all ?? 0,
                    commentCount: commentsByMovie.get(movie.id) ?? 0,
                },
            ];
        }),
    );
}

export const getHomeMovies = createServerFn({ method: 'GET' }).handler(
    async (): Promise<HomeMovies> => {
        const db = await getDb();
        const latestMovies = await db.movie.findMany({
            orderBy: { createdAt: 'desc' },
            take: 200,
            select: { id: true },
        });

        const latestIds = latestMovies.map((m) => m.id);
        const cards = await toMovieCards(latestIds);

        const pick = (ids: string[]) =>
            ids.map((id) => cards.get(id)).filter((c): c is MovieCardData => Boolean(c));

        return {
            latest: pick(latestIds),
        };
    },
);

const searchMoviesSchema = z.object({
    q: z.string().trim().max(200).optional(),
    sort: z.enum(movieSortOptions).optional(),
    dir: z.enum(movieSortDirOptions).optional(),
    kind: z.enum(movieKindOptions).optional(),
    genre: z.string().trim().max(80).optional(),
    cursor: z.coerce.number().int().min(0).optional(),
});

type SearchMoviesData = z.output<typeof searchMoviesSchema>;
type Db = Awaited<ReturnType<typeof getDb>>;

function uniqueItems(items: string[]) {
    return [ ...new Set(items.filter(Boolean)) ];
}

function genreSearchTerms(q: string) {
    const normalizedGenre = normalizeGenre(q);
    return uniqueItems([
        q,
        q.toLowerCase(),
        normalizedGenre === 'Другое' && q.trim().toLowerCase() !== 'другое'
            ? ''
            : normalizedGenre,
    ]);
}

function searchWhere(data: SearchMoviesData) {
    const q = data.q;
    const genreTerms = q ? genreSearchTerms(q) : [];
    const selectedGenreTerms = data.genre ? genreSearchTerms(data.genre) : [];
    return {
        ...(data.kind ? { kind: data.kind } : {}),
        ...(selectedGenreTerms.length ? { genres: { hasSome: selectedGenreTerms } } : {}),
        ...(q
            ? {
                OR: [
                    { title: { contains: q, mode: 'insensitive' as const } },
                    { director: { contains: q, mode: 'insensitive' as const } },
                    { country: { contains: q, mode: 'insensitive' as const } },
                    { genres: { hasSome: genreTerms } },
                ],
            }
            : {}),
    };
}

function searchSqlWhere(data: SearchMoviesData) {
    const params: Array<string | number> = [];
    const conditions: string[] = [];
    const q = data.q;

    if (data.kind) {
        params.push(data.kind);
        conditions.push(`m."kind"::text = $${params.length}`);
    }

    if (data.genre) {
        const genreChecks = genreSearchTerms(data.genre).map((term) => {
            params.push(term);
            return `m."genres" @> ARRAY[$${params.length}]::text[]`;
        });
        if (genreChecks.length) {
            conditions.push(`(${genreChecks.join(' OR ')})`);
        }
    }

    if (q) {
        params.push(`%${q}%`);
        const searchParam = `$${params.length}`;
        const genreChecks = genreSearchTerms(q).map((term) => {
            params.push(term);
            return `m."genres" @> ARRAY[$${params.length}]::text[]`;
        });
        conditions.push(`(
            m."title" ILIKE ${searchParam}
            OR m."director" ILIKE ${searchParam}
            OR m."country" ILIKE ${searchParam}
            ${genreChecks.map((check) => `OR ${check}`).join('\n')}
        )`);
    }

    return {
        params,
        sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    };
}

async function ratingSortedMovieIds(db: Db, data: SearchMoviesData, offset: number) {
    const dir = data.dir ?? 'desc';
    const orderDir = dir === 'asc' ? 'ASC' : 'DESC';
    const { params, sql } = searchSqlWhere(data);
    params.push(MOVIE_PAGE_SIZE);
    const limitParam = `$${params.length}`;
    params.push(offset);
    const offsetParam = `$${params.length}`;

    // Prisma cannot order Movie by average Rating value, so only this id page uses SQL.
    const rows = await db.$queryRawUnsafe<{ id: string }[]>(
        `
            SELECT m."id"
            FROM "Movie" m
            LEFT JOIN "Rating" r ON r."movieId" = m."id"
            ${sql}
            GROUP BY m."id"
            ORDER BY
                COALESCE(AVG(r."value"), 0) ${orderDir},
                COUNT(r."id") ${orderDir},
                m."createdAt" DESC,
                m."id" DESC
            LIMIT ${limitParam}
            OFFSET ${offsetParam}
        `,
        ...params,
    );
    return rows.map((row) => row.id);
}

export const searchMovies = createServerFn({ method: 'GET' })
    .validator(searchMoviesSchema)
    .handler(async ({ data }): Promise<MovieSearchPage> => {
        const db = await getDb();
        const offset = data.cursor ?? 0;
        const where = searchWhere(data);
        const sort: MovieSort = data.sort ?? 'new';
        const dir: MovieSortDir = data.dir ?? 'desc';
        const totalPromise = db.movie.count({ where });
        let ids: string[];

        if (sort === 'rating') {
            ids = await ratingSortedMovieIds(db, data, offset);
        } else {
            const orderBy = sort === 'year'
                ? [ { year: dir }, { createdAt: 'desc' as const }, { id: 'desc' as const } ]
                : sort === 'title'
                    ? [ { title: dir }, { createdAt: 'desc' as const }, { id: 'desc' as const } ]
                    : [ { createdAt: dir }, { id: dir } ];

            const movies = await db.movie.findMany({
                where,
                orderBy,
                skip: offset,
                take: MOVIE_PAGE_SIZE,
                select: { id: true },
            });
            ids = movies.map((movie) => movie.id);
        }

        const [ total, cards ] = await Promise.all([
            totalPromise,
            toMovieCards(ids),
        ]);

        // toMovieCards loses query order; ids keep requested sorting.
        const items = ids
            .map((id) => cards.get(id))
            .filter((c): c is MovieCardData => Boolean(c));
        const nextOffset = offset + items.length;

        return {
            items,
            nextCursor: nextOffset < total ? nextOffset : null,
            total,
        };
    });

export const getMovie = createServerFn({ method: 'GET' })
    .validator(z.object({ id: z.string().min(1) }))
    .handler(async ({ data }): Promise<MovieDetails | null> => {
        const db = await getDb();
        const user = await getAuthUser();

        const movie = await db.movie.findUnique({
            where: { id: data.id },
            include: { createdBy: { select: { name: true } } },
        });
        if (!movie) return null;

        const [ agg, myRating, myWatch ] = await Promise.all([
            db.rating.aggregate({
                where: { movieId: movie.id },
                _avg: { value: true },
                _count: { _all: true },
            }),
            user
                ? db.rating.findUnique({
                    where: { movieId_userId: { movieId: movie.id, userId: user.id } },
                })
                : null,
            user
                ? db.watchEntry.findUnique({
                    where: { movieId_userId: { movieId: movie.id, userId: user.id } },
                })
                : null,
        ]);

        return {
            id: movie.id,
            kind: movie.kind,
            title: movie.title,
            year: movie.year,
            country: movie.country,
            description: movie.description,
            posterUrl: toServedUploadUrl(movie.posterUrl),
            trailerUrls: movie.trailerUrls,
            watchLinks: movie.watchLinks,
            director: movie.director,
            genres: movie.genres,
            starring: movie.starring,
            durationMin: movie.durationMin,
            seasonsCount: movie.seasonsCount,
            episodesPerSeason: movie.episodesPerSeason,
            createdAt: movie.createdAt.toISOString(),
            addedBy: movie.createdBy?.name ?? null,
            avgRating: agg._avg.value ?? 0,
            ratingCount: agg._count._all,
            myRating: myRating?.value ?? null,
            myWatchStatus: myWatch?.status ?? null,
            canEdit: Boolean(user && (movie.createdById === user.id || user.role === 'ADMIN')),
        };
    });

function isHttpUrl(value: string) {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

const urlListSchema = z
    .array(
        z
            .string()
            .trim()
            .url()
            .refine(isHttpUrl, 'Укажите корректные http/https ссылки'),
    )
    .max(20)
    .optional();

const genreListSchema = z.array(z.enum(GENRE_OPTIONS)).max(GENRE_OPTIONS.length).optional();

const movieFieldsSchema = z.object({
    kind: z.enum(movieKindOptions).optional(),
    title: z.string().trim().min(1).max(200),
    year: z.coerce.number().int().min(1888).max(2100),
    country: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(5000),
    // External https URL, an uploaded /uploads/posters/... path, or a seed /posters/... path
    posterUrl: z
        .union([
            z.literal(''),
            z.string().trim().url(),
            z.string().trim().regex(/^\/(?:uploads\/)?posters\/[\w.-]+$/),
        ])
        .optional(),
    trailerUrls: urlListSchema,
    watchLinks: urlListSchema,
    director: z.string().trim().max(200).optional(),
    genres: genreListSchema,
    starring: z.string().trim().max(500).optional(),
    durationMin: z.union([ z.literal(''), z.coerce.number().int().min(1).max(1000) ]).optional(),
    seasonsCount: z.union([ z.literal(''), z.coerce.number().int().min(1).max(100) ]).optional(),
    episodesPerSeason: z.string().trim().max(500).optional(),
});

function splitList(value: string | undefined) {
    return value ? value.split(',').map((item) => item.trim()).filter(Boolean) : [];
}

function toMovieData(data: z.output<typeof movieFieldsSchema>) {
    const kind = data.kind ?? 'MOVIE';
    return {
        title: data.title,
        kind,
        dedupeKey: buildMovieDedupeKey({ kind, title: data.title, year: data.year }),
        year: data.year,
        country: data.country,
        description: data.description,
        posterUrl: toServedUploadUrl(data.posterUrl) || null,
        trailerUrls: data.trailerUrls ?? [],
        watchLinks: data.watchLinks ?? [],
        director: data.director || null,
        genres: uniqueItems(data.genres ?? []),
        starring: splitList(data.starring),
        durationMin: data.durationMin === '' ? null : data.durationMin ?? null,
        seasonsCount: data.kind === 'SERIES' && data.seasonsCount !== ''
            ? data.seasonsCount ?? null
            : null,
        episodesPerSeason: data.kind === 'SERIES'
            ? splitList(data.episodesPerSeason).map(Number).filter((value) => Number.isInteger(value) && value > 0)
            : [],
    };
}

type MovieWriteData = ReturnType<typeof toMovieData>;

const duplicateMovieSelect = {
    id: true,
    kind: true,
    title: true,
    year: true,
} as const;

function isUniqueConstraintError(error: unknown) {
    return typeof error === 'object'
        && error !== null
        && 'code' in error
        && (error as { code?: unknown }).code === 'P2002';
}

async function findDuplicateMovie(
    db: Db,
    movieData: Pick<MovieWriteData, 'kind' | 'title' | 'year' | 'dedupeKey'>,
    excludeMovieId?: string,
) {
    if (!movieData.dedupeKey) return null;

    const existingByKey = await db.movie.findUnique({
        where: { dedupeKey: movieData.dedupeKey },
        select: duplicateMovieSelect,
    });
    if (existingByKey && existingByKey.id !== excludeMovieId) return existingByKey;

    const candidates = await db.movie.findMany({
        where: {
            kind: movieData.kind,
            year: movieData.year,
            ...(excludeMovieId ? { id: { not: excludeMovieId } } : {}),
        },
        select: duplicateMovieSelect,
    });

    return candidates.find((candidate) =>
        buildMovieDedupeKey(candidate) === movieData.dedupeKey,
    ) ?? null;
}

export const createMovie = createServerFn({ method: 'POST' })
    .validator(movieFieldsSchema)
    .handler(async ({ data }) => {
        const db = await getDb();
        const user = await getAuthUser();
        if (!user) {
            return { ok: false as const, error: 'Требуется авторизация' };
        }

        const movieData = toMovieData(data);
        const duplicate = await findDuplicateMovie(db, movieData);
        if (duplicate) {
            return { ok: true as const, movieId: duplicate.id, existing: true as const };
        }

        let movie;
        try {
            movie = await db.movie.create({
                data: { ...movieData, createdById: user.id },
            });
        } catch (error) {
            if (!isUniqueConstraintError(error)) throw error;
            const existing = await db.movie.findUnique({
                where: { dedupeKey: movieData.dedupeKey },
                select: { id: true },
            });
            if (existing) return { ok: true as const, movieId: existing.id, existing: true as const };
            throw error;
        }

        try {
            const { createMovieNotifications } = await import('./notifications');
            await createMovieNotifications(movie.id, user.id);
        } catch {
            // Уведомления не должны блокировать добавление фильма.
        }

        return { ok: true as const, movieId: movie.id };
    });

export const updateMovie = createServerFn({ method: 'POST' })
    .validator(movieFieldsSchema.extend({ movieId: z.string().min(1) }))
    .handler(async ({ data }) => {
        const db = await getDb();
        const user = await getAuthUser();
        if (!user) {
            return { ok: false as const, error: 'Требуется авторизация' };
        }

        const movie = await db.movie.findUnique({
            where: { id: data.movieId },
            select: { createdById: true },
        });
        if (!movie) {
            return { ok: false as const, error: 'Фильм не найден' };
        }
        if (movie.createdById !== user.id && user.role !== 'ADMIN') {
            return { ok: false as const, error: 'Редактировать может только добавивший фильм' };
        }

        const { movieId, ...fields } = data;
        const movieData = toMovieData(fields);
        const duplicate = await findDuplicateMovie(db, movieData, movieId);
        if (duplicate) {
            return {
                ok: false as const,
                error: 'Такой фильм уже есть',
                movieId: duplicate.id,
            };
        }

        try {
            await db.movie.update({ where: { id: movieId }, data: movieData });
        } catch (error) {
            if (!isUniqueConstraintError(error)) throw error;
            const existing = await db.movie.findUnique({
                where: { dedupeKey: movieData.dedupeKey },
                select: { id: true },
            });
            return {
                ok: false as const,
                error: 'Такой фильм уже есть',
                movieId: existing?.id ?? movieId,
            };
        }

        return { ok: true as const, movieId };
    });

export const getMyLists = createServerFn({ method: 'GET' }).handler(
    async (): Promise<{ watchlist: MovieCardData[]; watched: MovieCardData[] } | null> => {
        const db = await getDb();
        const user = await getAuthUser();
        if (!user) return null;

        const entries = await db.watchEntry.findMany({
            where: { userId: user.id },
            orderBy: { updatedAt: 'desc' },
            select: { movieId: true, status: true },
        });

        const cards = await toMovieCards(entries.map((e) => e.movieId));
        const pick = (status: 'WATCHLIST' | 'WATCHED') =>
            entries
                .filter((e) => e.status === status)
                .map((e) => cards.get(e.movieId))
                .filter((c): c is MovieCardData => Boolean(c));

        return { watchlist: pick('WATCHLIST'), watched: pick('WATCHED') };
    },
);

export const rateMovie = createServerFn({ method: 'POST' })
    .validator(z.object({ movieId: z.string().min(1), value: z.number().int().min(1).max(5) }))
    .handler(async ({ data }) => {
        const db = await getDb();
        const user = await getAuthUser();
        if (!user) {
            return { ok: false as const, error: 'Требуется авторизация' };
        }

        const movie = await db.movie.findUnique({ where: { id: data.movieId }, select: { id: true } });
        if (!movie) {
            return { ok: false as const, error: 'Фильм не найден' };
        }

        await db.rating.upsert({
            where: { movieId_userId: { movieId: data.movieId, userId: user.id } },
            create: { movieId: data.movieId, userId: user.id, value: data.value },
            update: { value: data.value, createdAt: new Date() },
        });

        return { ok: true as const };
    });
