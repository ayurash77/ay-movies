import type { MovieKind } from './movie-data';

export type LookupLang = 'ru' | 'en';

export type LookupWikidataEntity = {
    labels?: Record<string, { value: string }>;
    descriptions?: Record<string, { value: string }>;
    sitelinks?: Record<string, { title?: string }>;
    claims?: Record<string, Array<{
        mainsnak?: {
            datavalue?: {
                value?: unknown;
            };
        };
        qualifiers?: Record<string, Array<{
            datavalue?: {
                value?: unknown;
            };
        }>>;
    }>>;
};

const MEDIA_INSTANCE_IDS = new Set([
    'Q11424', // film
    'Q5398426', // television series
    'Q15416', // television program
    'Q202866', // animated film
    'Q581714', // animated series
]);

const NON_MEDIA_INSTANCE_IDS = new Set([
    'Q5', // human
    'Q4167410', // Wikimedia disambiguation page
    'Q571', // book
    'Q7725634', // literary work
    'Q47461344', // written work
]);

export function buildLookupAttempts(title: string): Array<[ LookupLang, string ]> {
    const q = title.trim();
    const attempts: Array<[ LookupLang, string ]> = [
        [ 'ru', q ],
        [ 'ru', `${q} сериал` ],
        [ 'ru', `${q} фильм` ],
        [ 'en', q ],
        [ 'en', `${q} tv series` ],
        [ 'en', `${q} film` ],
    ];
    const seen = new Set<string>();
    return attempts.filter(([ lang, query ]) => {
        const key = `${lang}:${query.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export function label(entity: LookupWikidataEntity | null | undefined) {
    return entity?.labels?.ru?.value ?? entity?.labels?.en?.value ?? null;
}

export function claimValues(entity: LookupWikidataEntity | null, prop: string): unknown[] {
    return entity?.claims?.[prop]
        ?.map((claim) => claim.mainsnak?.datavalue?.value)
        .filter(Boolean) ?? [];
}

export function entityIds(entity: LookupWikidataEntity | null, prop: string) {
    return claimValues(entity, prop)
        .map((value) => typeof value === 'object' && value && 'id' in value ? String(value.id) : null)
        .filter((value): value is string => Boolean(value));
}

export function claimYear(entity: LookupWikidataEntity | null) {
    const time = [ 'P577', 'P580' ]
        .flatMap((prop) => claimValues(entity, prop))
        .map((value) => typeof value === 'object' && value && 'time' in value ? String(value.time) : '')
        .find(Boolean);
    const year = time?.match(/[+-](\d{4})/)?.[1];
    return year ? Number(year) : null;
}

export function claimDuration(entity: LookupWikidataEntity | null) {
    const raw = claimValues(entity, 'P2047')[0];
    if (!(typeof raw === 'object' && raw && 'amount' in raw)) return null;
    const amount = Number(String(raw.amount).replace(/^\+/, ''));
    if (!Number.isFinite(amount)) return null;
    return Math.round(amount > 500 ? amount / 60 : amount);
}

function claimQuantity(entity: LookupWikidataEntity | null, prop: string) {
    const raw = claimValues(entity, prop)[0];
    if (!(typeof raw === 'object' && raw && 'amount' in raw)) return null;
    const amount = Number(String(raw.amount).replace(/^\+/, ''));
    if (!Number.isInteger(amount) || amount <= 0) return null;
    return amount;
}

export type LookupSeriesPart = {
    id: string;
    ordinal: number;
};

export type LookupSeriesPartEntity = LookupSeriesPart & {
    entity: LookupWikidataEntity | null;
};

export function claimSeriesParts(entity: LookupWikidataEntity | null): LookupSeriesPart[] {
    return entity?.claims?.P527
        ?.map((claim) => {
            const value = claim.mainsnak?.datavalue?.value;
            const id = typeof value === 'object' && value && 'id' in value ? String(value.id) : '';
            const rawOrdinal = claim.qualifiers?.P1545?.[0]?.datavalue?.value;
            const ordinal = Number(rawOrdinal);
            return id && Number.isInteger(ordinal) && ordinal > 0
                ? { id, ordinal }
                : null;
        })
        .filter((value): value is LookupSeriesPart => Boolean(value))
        .sort((a, b) => a.ordinal - b.ordinal) ?? [];
}

export function claimSeriesInfo(
    entity: LookupWikidataEntity | null,
    seasonEntities: LookupSeriesPartEntity[] = [],
) {
    const seasonsCount = claimQuantity(entity, 'P2437');
    const totalEpisodes = claimQuantity(entity, 'P1113');
    const seasonCounts = seasonEntities
        .map((part) => ({
            ordinal: part.ordinal,
            count: claimQuantity(part.entity, 'P1113'),
        }))
        .filter((part): part is { ordinal: number; count: number } => Boolean(part.count))
        .sort((a, b) => a.ordinal - b.ordinal);
    const inferredSeasonsCount = seasonsCount ?? (seasonCounts.length ? Math.max(...seasonCounts.map((part) => part.ordinal)) : null);
    const completeSeasonCounts = inferredSeasonsCount
        && seasonCounts.length === inferredSeasonsCount
        && seasonCounts.every((part, index) => part.ordinal === index + 1);
    const episodesPerSeason = completeSeasonCounts
        ? seasonCounts.map((part) => part.count)
        : seasonsCount && totalEpisodes && totalEpisodes % seasonsCount === 0
        ? Array.from({ length: seasonsCount }, () => totalEpisodes / seasonsCount)
        : [];

    return {
        seasonsCount: inferredSeasonsCount,
        episodesPerSeason,
    };
}

export function isMediaEntity(entity: LookupWikidataEntity | null, text: string) {
    const ids = new Set([
        ...entityIds(entity, 'P31'),
        ...entityIds(entity, 'P136'),
    ]);

    if ([ ...NON_MEDIA_INSTANCE_IDS ].some((id) => ids.has(id))) return false;
    if ([ ...MEDIA_INSTANCE_IDS ].some((id) => ids.has(id))) return true;

    const normalized = text.toLowerCase();
    return /фильм|сериал|телесериал|мульт|анимац|film|movie|tv series|television series|animated/.test(normalized);
}

export function classifyKind(entity: LookupWikidataEntity | null, text: string, genres: string[]): MovieKind {
    const ids = new Set([
        ...entityIds(entity, 'P31'),
        ...entityIds(entity, 'P136'),
    ]);
    const normalized = `${text} ${genres.join(' ')}`.toLowerCase();

    if (ids.has('Q202866') || ids.has('Q581714') || /мульт|анимац|animated/.test(normalized)) {
        return 'CARTOON';
    }
    if (ids.has('Q5398426') || ids.has('Q15416') || /сериал|телесериал|tv series|television series/.test(normalized)) {
        return 'SERIES';
    }
    return 'MOVIE';
}

export function wikiTitleFromEntity(entity: LookupWikidataEntity, preferredLang: LookupLang) {
    return entity.sitelinks?.[`${preferredLang}wiki`]?.title
        ?? entity.sitelinks?.ruwiki?.title
        ?? entity.sitelinks?.enwiki?.title
        ?? null;
}
