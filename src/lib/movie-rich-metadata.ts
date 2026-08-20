import {
    externalRatingSchemas,
    movieCastMemberSchema,
    type ExternalRatings,
    type MovieCastMember,
} from './movie-lookup-types';

type RatingProvider = 'kinopoisk' | 'imdb' | 'russianCritics';
type ExternalRating = NonNullable<ExternalRatings[RatingProvider]>;
type NormalizedExternalRatings = Record<RatingProvider, ExternalRating | null>;

const ratingProviders: readonly RatingProvider[] = [ 'kinopoisk', 'imdb', 'russianCritics' ];

function normalizeRating(provider: RatingProvider, value: unknown): ExternalRating | null {
    const parsed = externalRatingSchemas[provider].safeParse(value);
    if (!parsed.success) return null;

    return {
        value: parsed.data.value,
        votes: parsed.data.votes ?? null,
    };
}

export function normalizeExternalRatings(value: unknown): NormalizedExternalRatings {
    const ratings = value && typeof value === 'object'
        ? value as Record<string, unknown>
        : {};

    return Object.fromEntries(ratingProviders.map((provider) => [
        provider,
        normalizeRating(provider, ratings[provider]),
    ])) as NormalizedExternalRatings;
}

export function normalizeCastSnapshot(value: readonly unknown[] | null | undefined): MovieCastMember[] {
    if (!Array.isArray(value)) return [];

    const ordered = value.flatMap((member, inputIndex) => {
        const parsed = movieCastMemberSchema.safeParse(member);
        return parsed.success ? [ { member: parsed.data, inputIndex } ] : [];
    }).sort((left, right) => left.member.order - right.member.order || left.inputIndex - right.inputIndex);

    const seenCredits = new Set<string>();
    return ordered.flatMap(({ member }) => {
        const key = `${member.provider}\u0000${member.externalId}\u0000${member.profession}`;
        if (seenCredits.has(key)) return [];

        seenCredits.add(key);
        return [ { ...member, order: seenCredits.size - 1 } ];
    });
}

export function mergeExternalRatings(existing: unknown, refreshed: unknown): NormalizedExternalRatings {
    const previous = normalizeExternalRatings(existing);
    const current = normalizeExternalRatings(refreshed);

    return Object.fromEntries(ratingProviders.map((provider) => [
        provider,
        current[provider] ?? previous[provider],
    ])) as NormalizedExternalRatings;
}
