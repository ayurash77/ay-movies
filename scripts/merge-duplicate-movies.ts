import { PrismaClient, type Prisma } from '@prisma/client';

import { buildMovieDedupeKey } from '../src/lib/movie-dedupe';
import {
    chooseCanonicalMovie,
    mergeMovieFields,
    normalizeStoredGenres,
    type MergeableMovie,
} from '../src/lib/movie-merge';

const db = new PrismaClient();
const apply = process.argv.includes('--apply');

const movieSelect = {
    id: true,
    kind: true,
    dedupeKey: true,
    title: true,
    year: true,
    country: true,
    description: true,
    posterUrl: true,
    trailerUrls: true,
    watchLinks: true,
    director: true,
    genres: true,
    durationMin: true,
    seasonsCount: true,
    episodesPerSeason: true,
    starring: true,
    createdAt: true,
} as const;

type MovieForMerge = Prisma.MovieGetPayload<{ select: typeof movieSelect }>;
type Tx = Prisma.TransactionClient;

function sameArray(a: unknown[], b: unknown[]) {
    return a.length === b.length && a.every((item, index) => item === b[index]);
}

function toMergeableMovie(movie: MovieForMerge): MergeableMovie {
    return {
        id: movie.id,
        kind: movie.kind,
        title: movie.title,
        year: movie.year,
        country: movie.country,
        description: movie.description,
        posterUrl: movie.posterUrl,
        trailerUrls: movie.trailerUrls,
        watchLinks: movie.watchLinks,
        director: movie.director,
        genres: movie.genres,
        durationMin: movie.durationMin,
        seasonsCount: movie.seasonsCount,
        episodesPerSeason: movie.episodesPerSeason,
        starring: movie.starring,
        createdAt: movie.createdAt,
    };
}

async function mergeRatings(tx: Tx, canonicalId: string, duplicateId: string) {
    const duplicateRatings = await tx.rating.findMany({
        where: { movieId: duplicateId },
        select: { id: true, userId: true, value: true, updatedAt: true },
    });
    if (duplicateRatings.length === 0) return;

    const canonicalRatings = await tx.rating.findMany({
        where: {
            movieId: canonicalId,
            userId: { in: duplicateRatings.map((rating) => rating.userId) },
        },
        select: { id: true, userId: true, value: true, updatedAt: true },
    });
    const canonicalByUser = new Map(canonicalRatings.map((rating) => [ rating.userId, rating ]));

    for (const rating of duplicateRatings) {
        const existing = canonicalByUser.get(rating.userId);
        if (!existing) {
            await tx.rating.update({ where: { id: rating.id }, data: { movieId: canonicalId } });
            continue;
        }

        if (rating.updatedAt > existing.updatedAt && rating.value !== existing.value) {
            await tx.rating.update({ where: { id: existing.id }, data: { value: rating.value } });
        }
        await tx.rating.delete({ where: { id: rating.id } });
    }
}

async function mergeWatchEntries(tx: Tx, canonicalId: string, duplicateId: string) {
    const duplicateEntries = await tx.watchEntry.findMany({
        where: { movieId: duplicateId },
        select: { id: true, userId: true, status: true, updatedAt: true },
    });
    if (duplicateEntries.length === 0) return;

    const canonicalEntries = await tx.watchEntry.findMany({
        where: {
            movieId: canonicalId,
            userId: { in: duplicateEntries.map((entry) => entry.userId) },
        },
        select: { id: true, userId: true, status: true, updatedAt: true },
    });
    const canonicalByUser = new Map(canonicalEntries.map((entry) => [ entry.userId, entry ]));

    for (const entry of duplicateEntries) {
        const existing = canonicalByUser.get(entry.userId);
        if (!existing) {
            await tx.watchEntry.update({ where: { id: entry.id }, data: { movieId: canonicalId } });
            continue;
        }

        const status = existing.status === 'WATCHED' || entry.status === 'WATCHED'
            ? 'WATCHED'
            : entry.status;
        if (status !== existing.status || entry.updatedAt > existing.updatedAt) {
            await tx.watchEntry.update({ where: { id: existing.id }, data: { status } });
        }
        await tx.watchEntry.delete({ where: { id: entry.id } });
    }
}

async function countStaleMovieNotificationHrefs() {
    const notifications = await db.notification.findMany({
        where: { movieId: { not: null }, href: { not: null } },
        select: { movieId: true, href: true },
    });

    return notifications.filter((notification) =>
        notification.movieId && notification.href !== `/movies/${notification.movieId}`,
    ).length;
}

async function repairMovieNotificationHrefs() {
    const notifications = await db.notification.findMany({
        where: { movieId: { not: null }, href: { not: null } },
        select: { id: true, movieId: true, href: true },
    });
    let repaired = 0;

    for (const notification of notifications) {
        if (!notification.movieId) continue;
        const href = `/movies/${notification.movieId}`;
        if (notification.href === href) continue;

        await db.notification.update({
            where: { id: notification.id },
            data: { href },
        });
        repaired += 1;
    }

    return repaired;
}

async function mergeDuplicateGroup(key: string, movies: MovieForMerge[]) {
    const mergeableMovies = movies.map(toMergeableMovie);
    const canonical = chooseCanonicalMovie(mergeableMovies);
    const duplicates = mergeableMovies.filter((movie) => movie.id !== canonical.id);
    const duplicateIds = duplicates.map((movie) => movie.id);
    const mergedFields = mergeMovieFields(canonical, duplicates);

    await db.$transaction(async (tx) => {
        await tx.movie.updateMany({
            where: { id: { in: duplicateIds } },
            data: { dedupeKey: null },
        });

        for (const duplicateId of duplicateIds) {
            await mergeRatings(tx, canonical.id, duplicateId);
            await mergeWatchEntries(tx, canonical.id, duplicateId);
        }

        await tx.comment.updateMany({
            where: { movieId: { in: duplicateIds } },
            data: { movieId: canonical.id },
        });
        for (const duplicateId of duplicateIds) {
            await tx.notification.updateMany({
                where: { movieId: duplicateId },
                data: {
                    movieId: canonical.id,
                    href: `/movies/${canonical.id}`,
                },
            });
        }
        await tx.movie.deleteMany({ where: { id: { in: duplicateIds } } });
        await tx.movie.update({
            where: { id: canonical.id },
            data: {
                ...mergedFields,
                dedupeKey: key,
            },
        });
    }, { timeout: 60_000 });

    console.log(`merged ${duplicateIds.length} duplicates into ${canonical.id}: ${canonical.title} (${canonical.year})`);
    return duplicateIds.length;
}

async function backfillSingleMovie(key: string, movie: MovieForMerge) {
    const genres = normalizeStoredGenres(movie.genres);
    if (movie.dedupeKey === key && sameArray(movie.genres, genres)) return false;

    await db.movie.update({
        where: { id: movie.id },
        data: { dedupeKey: key, genres },
    });
    return true;
}

async function main() {
    const movies = await db.movie.findMany({
        orderBy: [ { createdAt: 'asc' }, { id: 'asc' } ],
        select: movieSelect,
    });
    const groups = new Map<string, MovieForMerge[]>();

    for (const movie of movies) {
        const key = buildMovieDedupeKey(movie);
        if (!key) continue;
        groups.set(key, [ ...(groups.get(key) ?? []), movie ]);
    }

    const duplicateGroups = [ ...groups.entries() ].filter(([, group]) => group.length > 1);
    const staleNotificationHrefs = await countStaleMovieNotificationHrefs();
    console.log(`movies: ${movies.length}`);
    console.log(`duplicate groups: ${duplicateGroups.length}`);
    console.log(`stale movie notification hrefs: ${staleNotificationHrefs}`);

    if (!apply) {
        for (const [ key, group ] of duplicateGroups) {
            const canonical = chooseCanonicalMovie(group.map(toMergeableMovie));
            console.log(`${key}: ${group.length} records, canonical ${canonical.id} ${canonical.title} (${canonical.year})`);
        }
        console.log('dry-run only; rerun with --apply to merge and backfill');
        return;
    }

    let mergedDuplicates = 0;
    let backfilledMovies = 0;
    for (const [ key, group ] of groups) {
        if (group.length > 1) {
            mergedDuplicates += await mergeDuplicateGroup(key, group);
            backfilledMovies += 1;
            continue;
        }

        if (await backfillSingleMovie(key, group[0])) {
            backfilledMovies += 1;
        }
    }

    const repairedNotificationHrefs = await repairMovieNotificationHrefs();
    console.log(`merged duplicate records: ${mergedDuplicates}`);
    console.log(`backfilled movies: ${backfilledMovies}`);
    console.log(`repaired movie notification hrefs: ${repairedNotificationHrefs}`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await db.$disconnect();
    });
