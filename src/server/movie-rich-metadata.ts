import type { Prisma } from '@prisma/client';

import type { ExternalRatings, MovieCastMember } from '@/lib/movie-lookup-types';
import { normalizeCastSnapshot, normalizeExternalRatings } from '@/lib/movie-rich-metadata';
import type { MovieVideoMetadata } from '@/lib/movie-videos';
import { normalizeMovieVideoSnapshot } from '@/lib/movie-videos';

type MovieRatingUpdateData = Pick<
    Prisma.MovieUpdateInput,
    | 'kinopoiskRating'
    | 'kinopoiskVotes'
    | 'imdbRating'
    | 'imdbVotes'
    | 'russianCriticsPercent'
    | 'russianCriticsVotes'
>;

type PersonIdentityCreateData = Pick<
    Prisma.PersonCreateInput,
    | 'provider'
    | 'externalId'
    | 'name'
    | 'originalName'
    | 'photoUrl'
    | 'professions'
    | 'birthPlace'
    | 'facts'
>;

type PersonIdentityUpdateData = Pick<
    Prisma.PersonUpdateInput,
    'name' | 'originalName' | 'photoUrl'
>;

export type MovieRichMetadataWriter = {
    movie: {
        update(args: { where: { id: string }; data: MovieRatingUpdateData }): PromiseLike<unknown>;
    };
    person: {
        upsert(args: {
            where: { provider_externalId: { provider: string; externalId: string } };
            create: PersonIdentityCreateData;
            update: PersonIdentityUpdateData;
            select: { id: true };
        }): PromiseLike<{ id: string }>;
    };
    moviePersonCredit: {
        deleteMany(args: { where: { movieId: string } }): PromiseLike<unknown>;
        createMany(args: {
            data: Array<{
                movieId: string;
                personId: string;
                profession: string;
                role: string | null;
                position: number;
            }>;
        }): PromiseLike<unknown>;
    };
    movieVideo: {
        deleteMany(args: { where: { movieId: string } }): PromiseLike<unknown>;
        createMany(args: {
            data: Array<{
                movieId: string;
                provider: string;
                site: string;
                title: string;
                kind: 'TRAILER' | 'TEASER';
                url: string;
                thumbnailUrl: string | null;
                position: number;
            }>;
        }): PromiseLike<unknown>;
    };
};

export type MovieRichMetadataSnapshot = {
    importSucceeded: boolean;
    externalRatings?: ExternalRatings;
    cast?: MovieCastMember[];
    videos?: MovieVideoMetadata[];
};

function ratingWriteData(value: unknown): MovieRatingUpdateData {
    const ratings = normalizeExternalRatings(value);
    const data: MovieRatingUpdateData = {};

    if (ratings.kinopoisk) {
        data.kinopoiskRating = ratings.kinopoisk.value;
        if (ratings.kinopoisk.votes !== null) data.kinopoiskVotes = ratings.kinopoisk.votes;
    }
    if (ratings.imdb) {
        data.imdbRating = ratings.imdb.value;
        if (ratings.imdb.votes !== null) data.imdbVotes = ratings.imdb.votes;
    }
    if (ratings.russianCritics) {
        data.russianCriticsPercent = ratings.russianCritics.value;
        if (ratings.russianCritics.votes !== null) {
            data.russianCriticsVotes = ratings.russianCritics.votes;
        }
    }

    return data;
}

export async function writeMovieRichMetadata(
    tx: MovieRichMetadataWriter,
    movieId: string,
    snapshot: MovieRichMetadataSnapshot,
) {
    if (!snapshot.importSucceeded) return;

    const ratings = ratingWriteData(snapshot.externalRatings);
    if (Object.keys(ratings).length > 0) {
        await tx.movie.update({ where: { id: movieId }, data: ratings });
    }

    const videos = normalizeMovieVideoSnapshot(snapshot.videos);
    if (videos.length > 0) {
        await tx.movieVideo.deleteMany({ where: { movieId } });
        await tx.movieVideo.createMany({
            data: videos.map((video) => ({ movieId, ...video })),
        });
    }

    const cast = normalizeCastSnapshot(snapshot.cast);
    if (cast.length === 0) return;

    const credits = [];
    for (const member of cast) {
        const person = await tx.person.upsert({
            where: {
                provider_externalId: {
                    provider: member.provider,
                    externalId: member.externalId,
                },
            },
            create: {
                provider: member.provider,
                externalId: member.externalId,
                name: member.name,
                originalName: member.originalName ?? null,
                photoUrl: member.photoUrl ?? null,
                professions: [ member.profession ],
                birthPlace: [],
                facts: [],
            },
            update: {
                name: member.name,
                ...(member.originalName?.trim() ? { originalName: member.originalName } : {}),
                ...(member.photoUrl ? { photoUrl: member.photoUrl } : {}),
            },
            select: { id: true },
        });

        credits.push({
            movieId,
            personId: person.id,
            profession: member.profession,
            role: member.role ?? null,
            position: member.order,
        });
    }

    await tx.moviePersonCredit.deleteMany({ where: { movieId } });
    await tx.moviePersonCredit.createMany({ data: credits });
}
