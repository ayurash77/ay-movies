import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import { movieKindOptions, type MovieKind } from '@/lib/movie-data';

const lookupResultSchema = z.object({
    found: z.boolean(),
    kind: z.enum(movieKindOptions).optional(),
    title: z.string().nullish(),
    originalTitle: z.string().nullish(),
    year: z.number().int().nullish(),
    country: z.string().nullish(),
    description: z.string().nullish(),
    director: z.string().nullish(),
    genres: z.array(z.string()).nullish(),
    starring: z.array(z.string()).nullish(),
    durationMin: z.number().int().nullish(),
    posterUrl: z.string().nullish(),
});

export type MovieLookup = z.infer<typeof lookupResultSchema>;

type WikiSearchResponse = {
    query?: { search?: Array<{ title: string }> };
};

type WikiPage = {
    title: string;
    extract?: string;
    pageprops?: { wikibase_item?: string };
    thumbnail?: { source?: string };
};

type WikiPageResponse = {
    query?: { pages?: Record<string, WikiPage> };
};

type WikidataEntity = {
    labels?: Record<string, { value: string }>;
    claims?: Record<string, Array<{
        mainsnak?: {
            datavalue?: {
                value?: unknown;
            };
        };
    }>>;
};

async function getJson<T>(url: string): Promise<T | null> {
    try {
        const res = await fetch(url, {
            signal: AbortSignal.timeout(7000),
            headers: { 'user-agent': 'AY Movies/1.0 (movie metadata lookup)' },
        });
        if (!res.ok) return null;
        return (await res.json()) as T;
    } catch {
        return null;
    }
}

async function searchWiki(lang: 'ru' | 'en', query: string) {
    const params = new URLSearchParams({
        action: 'query',
        list: 'search',
        srsearch: query,
        srlimit: '5',
        format: 'json',
    });
    const json = await getJson<WikiSearchResponse>(`https://${lang}.wikipedia.org/w/api.php?${params}`);
    return json?.query?.search?.map((item) => item.title) ?? [];
}

async function loadWikiPage(lang: 'ru' | 'en', title: string): Promise<WikiPage | null> {
    const params = new URLSearchParams({
        action: 'query',
        titles: title,
        redirects: '1',
        prop: 'extracts|pageprops|pageimages',
        exintro: '1',
        explaintext: '1',
        pithumbsize: '700',
        pilicense: 'any',
        format: 'json',
    });
    const json = await getJson<WikiPageResponse>(`https://${lang}.wikipedia.org/w/api.php?${params}`);
    return Object.values(json?.query?.pages ?? {})[0] ?? null;
}

async function loadWikidata(id: string): Promise<WikidataEntity | null> {
    const json = await getJson<{ entities?: Record<string, WikidataEntity> }>(
        `https://www.wikidata.org/wiki/Special:EntityData/${id}.json`,
    );
    return json?.entities?.[id] ?? null;
}

function label(entity: WikidataEntity | null | undefined) {
    return entity?.labels?.ru?.value ?? entity?.labels?.en?.value ?? null;
}

function claimValues(entity: WikidataEntity | null, prop: string): unknown[] {
    return entity?.claims?.[prop]
        ?.map((claim) => claim.mainsnak?.datavalue?.value)
        .filter(Boolean) ?? [];
}

function entityIds(entity: WikidataEntity | null, prop: string) {
    return claimValues(entity, prop)
        .map((value) => typeof value === 'object' && value && 'id' in value ? String(value.id) : null)
        .filter((value): value is string => Boolean(value));
}

async function entityLabels(ids: string[], limit = 6) {
    const unique = [ ...new Set(ids) ].slice(0, limit);
    const entities = await Promise.all(unique.map(loadWikidata));
    return entities.map(label).filter((value): value is string => Boolean(value));
}

function claimYear(entity: WikidataEntity | null) {
    const time = claimValues(entity, 'P577')
        .map((value) => typeof value === 'object' && value && 'time' in value ? String(value.time) : '')
        .find(Boolean);
    const year = time?.match(/[+-](\d{4})/)?.[1];
    return year ? Number(year) : null;
}

function claimDuration(entity: WikidataEntity | null) {
    const raw = claimValues(entity, 'P2047')[0];
    if (!(typeof raw === 'object' && raw && 'amount' in raw)) return null;
    const amount = Number(String(raw.amount).replace(/^\+/, ''));
    if (!Number.isFinite(amount)) return null;
    return Math.round(amount > 500 ? amount / 60 : amount);
}

function firstSentences(text: string | undefined) {
    const normalized = text?.replace(/\s+/g, ' ').trim();
    if (!normalized) return null;
    return normalized.split(/(?<=[.!?])\s+/).slice(0, 4).join(' ').slice(0, 1200);
}

function classifyKind(entity: WikidataEntity | null, page: WikiPage, genres: string[]): MovieKind {
    const ids = new Set([
        ...entityIds(entity, 'P31'),
        ...entityIds(entity, 'P136'),
    ]);
    const text = `${page.title} ${page.extract ?? ''} ${genres.join(' ')}`.toLowerCase();

    if (ids.has('Q202866') || ids.has('Q581714') || /мульт|анимац|animated/.test(text)) {
        return 'CARTOON';
    }
    if (ids.has('Q5398426') || ids.has('Q7725310') || /сериал|series/.test(text)) {
        return 'SERIES';
    }
    return 'MOVIE';
}

async function buildMovie(lang: 'ru' | 'en', page: WikiPage): Promise<MovieLookup | null> {
    const entity = page.pageprops?.wikibase_item
        ? await loadWikidata(page.pageprops.wikibase_item)
        : null;
    if (!entity && !page.extract) return null;

    const [ countries, directors, genres, cast ] = await Promise.all([
        entityLabels(entityIds(entity, 'P495'), 3),
        entityLabels(entityIds(entity, 'P57'), 2),
        entityLabels(entityIds(entity, 'P136'), 4),
        entityLabels(entityIds(entity, 'P161'), 6),
    ]);

    const title = entity?.labels?.ru?.value ?? page.title;
    const originalTitle = lang === 'en'
        ? entity?.labels?.en?.value ?? page.title
        : entity?.labels?.en?.value ?? null;

    return {
        found: true,
        kind: classifyKind(entity, page, genres),
        title,
        originalTitle,
        year: claimYear(entity),
        country: countries.join(', ') || null,
        description: firstSentences(page.extract),
        director: directors.join(', ') || null,
        genres: genres.map((item) => item.toLowerCase()),
        starring: cast,
        durationMin: claimDuration(entity),
        posterUrl: page.thumbnail?.source ?? null,
    };
}

export const lookupMovie = createServerFn({ method: 'POST' })
    .validator(z.object({ title: z.string().trim().min(2).max(200) }))
    .handler(async ({ data }) => {
        const { getAuthUser } = await import('./session');
        const user = await getAuthUser();
        if (!user) {
            return { ok: false as const, error: 'Требуется авторизация' };
        }

        const attempts: Array<[ 'ru' | 'en', string ]> = [
            [ 'ru', `${data.title} фильм` ],
            [ 'ru', data.title ],
            [ 'en', `${data.title} film` ],
            [ 'en', data.title ],
        ];

        for (const [ lang, query ] of attempts) {
            const titles = await searchWiki(lang, query);
            for (const title of titles.slice(0, 3)) {
                const page = await loadWikiPage(lang, title);
                if (!page) continue;
                const movie = await buildMovie(lang, page);
                if (movie?.title && (movie.description || movie.year)) {
                    return { ok: true as const, movie };
                }
            }
        }

        return {
            ok: false as const,
            error: 'Не удалось найти данные. Заполните поля вручную.',
        };
    });
