import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import { toServedUploadUrl } from '@/lib/upload-url';

async function getDb() {
    return (await import('@/lib/db')).db;
}

async function getAuthUser() {
    return (await import('./session')).getAuthUser();
}

export type ReviewSentiment = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';

export type ReviewActor = {
    userId: string;
    role: string;
};

export type MovieReview = {
    id: string;
    title: string | null;
    sentiment: ReviewSentiment;
    text: string;
    createdAt: string;
    updatedAt: string;
    edited: boolean;
    author: {
        id: string;
        name: string;
        avatarUrl: string | null;
    };
    canManage: boolean;
};

export type ReviewContent = {
    title: string | null;
    sentiment: ReviewSentiment;
    text: string;
};

type ReviewRow = {
    id: string;
    title: string | null;
    sentiment: string;
    text: string;
    createdAt: Date;
    updatedAt: Date;
    user: {
        id: string;
        name: string;
        avatarUrl: string | null;
    };
};

type ReviewContentInput = {
    title?: string | null;
    sentiment: unknown;
    text: unknown;
};

type ReviewRequestInput = ReviewContentInput & {
    reviewId: string;
};

type AddReviewRequestInput = ReviewContentInput & {
    movieId: string;
};

type ValidationResult<T> =
    | { ok: true; value: T }
    | { ok: false; error: string };

const titleSchema = z.string().trim().max(120);
const textSchema = z.string().trim().min(1).max(5000);
const sentimentSchema = z.enum([ 'POSITIVE', 'NEUTRAL', 'NEGATIVE' ]);
const idSchema = z.string().trim().min(1);

export function canManageReview(actor: ReviewActor | null, authorId: string) {
    return Boolean(actor && (actor.userId === authorId || actor.role === 'ADMIN'));
}

export function validateReviewContent(input: ReviewContentInput): ValidationResult<ReviewContent> {
    const rawTitle = input.title ?? '';
    if (typeof rawTitle !== 'string') {
        return { ok: false, error: 'Введите корректный заголовок рецензии' };
    }
    const title = titleSchema.safeParse(rawTitle);
    if (!title.success) {
        return { ok: false, error: 'Заголовок рецензии не должен превышать 120 символов' };
    }

    const sentiment = sentimentSchema.safeParse(input.sentiment);
    if (!sentiment.success) {
        return { ok: false, error: 'Выберите корректное впечатление от фильма' };
    }

    if (typeof input.text !== 'string') {
        return { ok: false, error: 'Введите текст рецензии' };
    }
    const trimmedText = input.text.trim();
    if (!trimmedText) {
        return { ok: false, error: 'Введите текст рецензии' };
    }
    const text = textSchema.safeParse(input.text);
    if (!text.success) {
        return { ok: false, error: 'Текст рецензии не должен превышать 5000 символов' };
    }

    return {
        ok: true,
        value: {
            title: title.data || null,
            sentiment: sentiment.data,
            text: text.data,
        },
    };
}

export function mapMovieReview(row: ReviewRow, actor: ReviewActor | null): MovieReview {
    return {
        id: row.id,
        title: row.title,
        sentiment: sentimentSchema.catch('NEUTRAL').parse(row.sentiment),
        text: row.text,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        edited: row.updatedAt.getTime() > row.createdAt.getTime(),
        author: {
            id: row.user.id,
            name: row.user.name,
            avatarUrl: toServedUploadUrl(row.user.avatarUrl),
        },
        canManage: canManageReview(actor, row.user.id),
    };
}

export type ReviewAuthorizationDependencies = {
    getActor: () => Promise<ReviewActor | null>;
    findAuthorId: (reviewId: string) => Promise<string | null>;
};

export async function authorizeReviewManagement(
    reviewId: string,
    dependencies: ReviewAuthorizationDependencies,
): Promise<
    | { ok: true; actor: ReviewActor }
    | { ok: false; error: string }
> {
    const actor = await dependencies.getActor();
    if (!actor) return { ok: false, error: 'Требуется авторизация' };

    const authorId = await dependencies.findAuthorId(reviewId);
    if (!authorId) return { ok: false, error: 'Рецензия не найдена' };
    if (!canManageReview(actor, authorId)) {
        return { ok: false, error: 'Недостаточно прав для управления рецензией' };
    }

    return { ok: true, actor };
}

function actorFromUser(user: { id: string; role: string } | null): ReviewActor | null {
    return user ? { userId: user.id, role: user.role } : null;
}

function validateAddReviewRequest(input: AddReviewRequestInput) {
    const movieId = idSchema.safeParse(input?.movieId);
    if (!movieId.success) {
        return { ok: false as const, error: 'Фильм не найден' };
    }
    const content = validateReviewContent(input);
    if (!content.ok) return content;
    return { ok: true as const, value: { movieId: movieId.data, ...content.value } };
}

function validateUpdateReviewRequest(input: ReviewRequestInput) {
    const reviewId = idSchema.safeParse(input?.reviewId);
    if (!reviewId.success) {
        return { ok: false as const, error: 'Рецензия не найдена' };
    }
    const content = validateReviewContent(input);
    if (!content.ok) return content;
    return { ok: true as const, value: { reviewId: reviewId.data, ...content.value } };
}

function validateDeleteReviewRequest(input: { reviewId: string }) {
    const reviewId = idSchema.safeParse(input?.reviewId);
    return reviewId.success
        ? { ok: true as const, reviewId: reviewId.data }
        : { ok: false as const, error: 'Рецензия не найдена' };
}

export const getReviews = createServerFn({ method: 'GET' })
    .validator(z.object({ movieId: z.string().trim().min(1) }))
    .handler(async ({ data }): Promise<MovieReview[]> => {
        const db = await getDb();
        const user = await getAuthUser();
        const reviews = await db.comment.findMany({
            where: { movieId: data.movieId },
            orderBy: { createdAt: 'desc' },
            take: 100,
            include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        });
        const actor = actorFromUser(user);
        return reviews.map((review) => mapMovieReview(review, actor));
    });

export const addReview = createServerFn({ method: 'POST' })
    .validator(validateAddReviewRequest)
    .handler(async ({ data }) => {
        if (!data.ok) return data;

        const db = await getDb();
        const user = await getAuthUser();
        if (!user) return { ok: false as const, error: 'Требуется авторизация' };

        const movie = await db.movie.findUnique({
            where: { id: data.value.movieId },
            select: { id: true },
        });
        if (!movie) return { ok: false as const, error: 'Фильм не найден' };

        const review = await db.comment.create({
            data: {
                movieId: data.value.movieId,
                userId: user.id,
                title: data.value.title,
                sentiment: data.value.sentiment,
                text: data.value.text,
            },
            select: { id: true },
        });
        try {
            const { createReviewNotifications } = await import('./notifications');
            await createReviewNotifications(review.id);
        } catch {
            // Notification delivery must not block publishing the review.
        }

        return { ok: true as const };
    });

export const updateReview = createServerFn({ method: 'POST' })
    .validator(validateUpdateReviewRequest)
    .handler(async ({ data }) => {
        if (!data.ok) return data;

        const db = await getDb();
        const authorization = await authorizeReviewManagement(data.value.reviewId, {
            getActor: async () => actorFromUser(await getAuthUser()),
            findAuthorId: async (reviewId) => {
                const review = await db.comment.findUnique({ where: { id: reviewId }, select: { userId: true } });
                return review?.userId ?? null;
            },
        });
        if (!authorization.ok) return authorization;

        const result = await db.comment.updateMany({
            where: { id: data.value.reviewId },
            data: {
                title: data.value.title,
                sentiment: data.value.sentiment,
                text: data.value.text,
            },
        });
        if (!result.count) return { ok: false as const, error: 'Рецензия не найдена' };
        return { ok: true as const };
    });

export const deleteReview = createServerFn({ method: 'POST' })
    .validator(validateDeleteReviewRequest)
    .handler(async ({ data }) => {
        if (!data.ok) return data;

        const db = await getDb();
        const authorization = await authorizeReviewManagement(data.reviewId, {
            getActor: async () => actorFromUser(await getAuthUser()),
            findAuthorId: async (reviewId) => {
                const review = await db.comment.findUnique({ where: { id: reviewId }, select: { userId: true } });
                return review?.userId ?? null;
            },
        });
        if (!authorization.ok) return authorization;

        const result = await db.comment.deleteMany({ where: { id: data.reviewId } });
        if (!result.count) return { ok: false as const, error: 'Рецензия не найдена' };
        return { ok: true as const };
    });
