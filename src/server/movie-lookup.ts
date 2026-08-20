import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import { movieKindOptions } from '@/lib/movie-data';
import { movieLookupCandidateSchema, type MovieLookupCandidate } from '@/lib/movie-lookup-types';

export type { MovieLookup, MovieLookupCandidate } from '@/lib/movie-lookup-types';

const lookupInputSchema = z.object({
    title: z.string().trim().min(2).max(200),
    kind: z.enum(movieKindOptions).optional(),
});

async function resolveLookupCandidates(data: z.infer<typeof lookupInputSchema>) {
    const { getAuthUser } = await import('./session');
    const user = await getAuthUser();
    if (!user) {
        return { ok: false as const, error: 'Требуется авторизация' };
    }

    const { lookupWikidataCandidates } = await import('./movie-lookup-providers/wikidata');
    const candidates = (await lookupWikidataCandidates(data.title))
        .filter((candidate) => !data.kind || candidate.kind === data.kind)
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
