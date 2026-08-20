import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import { movieKindOptions } from '@/lib/movie-data';
import {
    lookupProviderSchema,
    movieLookupCandidateSchema,
    type MovieLookupCandidate,
} from '@/lib/movie-lookup-types';

export type { MovieLookup, MovieLookupCandidate } from '@/lib/movie-lookup-types';

const lookupInputSchema = z.object({
    title: z.string().trim().min(2).max(200),
    kind: z.enum(movieKindOptions).optional(),
});

const lookupDetailsInputSchema = z.object({
    provider: lookupProviderSchema,
    externalId: z.string().trim().min(1).max(100),
});

function isWikidataEntityId(externalId: string) {
    return /^Q\d+$/i.test(externalId);
}

async function resolveLookupCandidates(data: z.infer<typeof lookupInputSchema>) {
    const { getAuthUser } = await import('./session');
    const user = await getAuthUser();
    if (!user) {
        return { ok: false as const, error: 'Требуется авторизация' };
    }

    const [
        { lookupKinopoiskCandidates },
        { lookupKinopoiskUnofficialCandidates },
        { lookupWikidataCandidates },
    ] = await Promise.all([
        import('./movie-lookup-providers/kinopoisk-dev'),
        import('./movie-lookup-providers/kinopoisk-unofficial'),
        import('./movie-lookup-providers/wikidata'),
    ]);
    const [ kinopoiskCandidates, kinopoiskUnofficialCandidates, wikidataCandidates ] = await Promise.all([
        lookupKinopoiskCandidates(data.title, data.kind),
        lookupKinopoiskUnofficialCandidates(data.title, data.kind),
        lookupWikidataCandidates(data.title),
    ]);
    const seen = new Set<string>();
    const candidates = [ ...kinopoiskCandidates, ...kinopoiskUnofficialCandidates, ...wikidataCandidates ]
        .filter((candidate) => !data.kind || candidate.kind === data.kind)
        .filter((candidate) => {
            const key = `${candidate.provider}:${candidate.externalId ?? candidate.title}:${candidate.year ?? ''}`.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .map((candidate) => movieLookupCandidateSchema.parse(candidate))
        .slice(0, 8);

    if (!candidates.length) {
        return {
            ok: false as const,
            error: 'Не удалось найти данные. Заполните поля вручную.',
        };
    }

    return { ok: true as const, candidates };
}

export const lookupMovieCandidates = createServerFn({ method: 'POST' })
    .validator(lookupInputSchema)
    .handler(async ({ data }) => resolveLookupCandidates(data));

export const lookupMovie = createServerFn({ method: 'POST' })
    .validator(z.object({ title: z.string().trim().min(2).max(200) }))
    .handler(async ({ data }) => {
        const result = await resolveLookupCandidates(data);
        if (!result.ok) return result;
        return {
            ok: true as const,
            movie: result.candidates[0] as MovieLookupCandidate,
        };
    });

export const loadMovieLookupDetails = createServerFn({ method: 'POST' })
    .validator(lookupDetailsInputSchema)
    .handler(async ({ data }) => {
        const { getAuthUser } = await import('./session');
        if (!await getAuthUser()) return { ok: false as const, error: 'Требуется авторизация' };

        if (data.provider === 'wikidata' || isWikidataEntityId(data.externalId)) {
            return {
                ok: false as const,
                error: 'Подробные данные для Wikipedia / Wikidata недоступны',
            };
        }

        const { loadKinopoiskCandidate } = await import('./movie-lookup-providers/kinopoisk-dev');
        const { loadKinopoiskUnofficialCandidate } = await import('./movie-lookup-providers/kinopoisk-unofficial');
        const loaders = data.provider === 'kinopoisk-unofficial'
            ? [ loadKinopoiskUnofficialCandidate, loadKinopoiskCandidate ]
            : [ loadKinopoiskCandidate, loadKinopoiskUnofficialCandidate ];

        for (const load of loaders) {
            try {
                const movie = await load(data.externalId);
                if (movie) return { ok: true as const, movie };
            } catch {
                // Continue with the fallback without exposing provider errors.
            }
        }

        return { ok: false as const, error: 'Не удалось загрузить подробные данные' };
    });
