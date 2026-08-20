import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import { type MovieLookup } from '@/lib/movie-lookup-types';
import {
    buildLookupAttempts,
    claimDuration,
    claimSeriesInfo,
    claimSeriesParts,
    claimYear,
    classifyKind,
    entityIds,
    label,
    isMediaEntity,
    type LookupLang,
    type LookupWikidataEntity,
} from '@/lib/movie-lookup-utils';

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

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson<T>(url: string): Promise<T | null> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            const res = await fetch(url, {
                signal: AbortSignal.timeout(15000),
                headers: { 'user-agent': 'AY Movies/1.0 (movie metadata lookup)' },
            });
            if (!res.ok) return null;
            return (await res.json()) as T;
        } catch {
            if (attempt < 2) await delay(500 * (attempt + 1));
        }
    }
    return null;
}

async function searchWiki(lang: LookupLang, query: string) {
    const params = new URLSearchParams({
        action: 'query',
        list: 'search',
        srsearch: query,
        srlimit: '8',
        format: 'json',
    });
    const json = await getJson<WikiSearchResponse>(`https://${lang}.wikipedia.org/w/api.php?${params}`);
    return json?.query?.search?.map((item) => item.title) ?? [];
}

async function loadWikiPage(lang: LookupLang, title: string): Promise<WikiPage | null> {
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

async function loadWikidata(id: string): Promise<LookupWikidataEntity | null> {
    const json = await getJson<{ entities?: Record<string, LookupWikidataEntity> }>(
        `https://www.wikidata.org/wiki/Special:EntityData/${id}.json`,
    );
    return json?.entities?.[id] ?? null;
}

async function entityLabels(ids: string[], limit = 6) {
    const unique = [ ...new Set(ids) ].slice(0, limit);
    const entities = await Promise.all(unique.map(loadWikidata));
    return entities.map(label).filter((value): value is string => Boolean(value));
}

function firstSentences(text: string | undefined) {
    const normalized = text?.replace(/\s+/g, ' ').trim();
    if (!normalized) return null;
    return normalized.split(/(?<=[.!?])\s+/).slice(0, 4).join(' ').slice(0, 1200);
}

async function buildMovie(lang: LookupLang, page: WikiPage): Promise<MovieLookup | null> {
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
    const mediaText = `${page.title} ${page.extract ?? ''} ${genres.join(' ')}`;
    if (!isMediaEntity(entity, mediaText)) return null;

    const title = entity?.labels?.ru?.value ?? page.title;
    const originalTitle = lang === 'en'
        ? entity?.labels?.en?.value ?? page.title
        : entity?.labels?.en?.value ?? null;
    const kind = classifyKind(entity, mediaText, genres);
    const seriesParts = kind === 'SERIES' ? claimSeriesParts(entity).slice(0, 30) : [];
    const seasonEntities = seriesParts.length
        ? await Promise.all(seriesParts.map((part) => loadWikidata(part.id)))
        : [];
    const seriesInfo = kind === 'SERIES'
        ? claimSeriesInfo(entity, seriesParts.map((part, index) => ({ ...part, entity: seasonEntities[index] ?? null })))
        : { seasonsCount: null, episodesPerSeason: [] };
    const genreHints = [
        ...genres,
        entity?.descriptions?.ru?.value,
        entity?.descriptions?.en?.value,
    ].filter((value): value is string => Boolean(value));

    return {
        found: true,
        kind,
        title,
        originalTitle,
        year: claimYear(entity),
        country: countries.join(', ') || null,
        description: firstSentences(page.extract),
        director: directors.join(', ') || null,
        genres: genreHints.map((item) => item.toLowerCase()),
        starring: cast,
        durationMin: claimDuration(entity),
        seasonsCount: seriesInfo.seasonsCount,
        episodesPerSeason: seriesInfo.episodesPerSeason,
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

        const attempts = buildLookupAttempts(data.title);
        for (const lang of [ 'ru', 'en' ] as const) {
            const page = await loadWikiPage(lang, data.title);
            if (!page) continue;
            const movie = await buildMovie(lang, page);
            if (movie?.title && (movie.description || movie.year)) {
                return { ok: true as const, movie };
            }
        }

        for (const [ lang, query ] of attempts) {
            const titles = await searchWiki(lang, query);
            for (const title of titles.slice(0, 5)) {
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
