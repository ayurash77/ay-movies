import type { MovieKind } from '@/lib/movie-data';
import type { MovieLookupCandidate } from '@/lib/movie-lookup-types';

type KinopoiskName = { name?: string | null };
type KinopoiskPerson = {
    name?: string | null;
    profession?: string | null;
    enProfession?: string | null;
};

export type KinopoiskMovie = {
    id?: number | string | null;
    type?: string | null;
    name?: string | null;
    alternativeName?: string | null;
    enName?: string | null;
    year?: number | null;
    description?: string | null;
    shortDescription?: string | null;
    movieLength?: number | null;
    seriesLength?: number | null;
    rating?: { kp?: number | null; imdb?: number | null } | null;
    poster?: { previewUrl?: string | null; url?: string | null } | null;
    countries?: KinopoiskName[] | null;
    genres?: KinopoiskName[] | null;
    persons?: KinopoiskPerson[] | null;
};

type KinopoiskSearchResponse = { docs?: KinopoiskMovie[] };
type KinopoiskSeasonResponse = {
    docs?: Array<{
        number?: number | null;
        episodes?: unknown[] | null;
        episodesCount?: number | null;
    }>;
};

const DEFAULT_BASE_URL = 'https://api.kinopoisk.dev';

function text(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalize(value: string) {
    return value.toLowerCase().replaceAll('ё', 'е').trim();
}

function detectKind(movie: KinopoiskMovie): MovieKind {
    const type = normalize(text(movie.type));
    const genres = movie.genres?.map((genre) => normalize(text(genre.name))).join(' ') ?? '';
    if (
        type.includes('cartoon') ||
        type.includes('animated') ||
        type.includes('anime') ||
        genres.includes('мульт') ||
        genres.includes('аниме')
    ) {
        return 'CARTOON';
    }
    if (type.includes('series') || type.includes('tv')) return 'SERIES';
    return 'MOVIE';
}

function personMatches(person: KinopoiskPerson, ruNeedle: string, enProfession: string) {
    const profession = normalize(text(person.profession));
    return normalize(text(person.enProfession)) === enProfession || profession.includes(ruNeedle);
}

function sourceUrl(movie: KinopoiskMovie) {
    if (movie.id == null) return undefined;
    return `https://www.kinopoisk.ru/film/${movie.id}/`;
}

function confidenceFor(movie: KinopoiskMovie) {
    if (movie.rating?.kp) return 92;
    if (movie.year) return 86;
    return 78;
}

export function mapKinopoiskMovie(
    movie: KinopoiskMovie,
    episodesPerSeason: number[] = [],
): MovieLookupCandidate | null {
    const title = text(movie.name) || text(movie.alternativeName) || text(movie.enName);
    if (!title) return null;

    const directorNames = movie.persons
        ?.filter((person) => personMatches(person, 'режисс', 'director'))
        .map((person) => text(person.name))
        .filter(Boolean)
        .slice(0, 2) ?? [];
    const actorNames = movie.persons
        ?.filter((person) => personMatches(person, 'актер', 'actor') || personMatches(person, 'актёр', 'actor'))
        .map((person) => text(person.name))
        .filter(Boolean)
        .slice(0, 6) ?? [];
    const kind = detectKind(movie);

    return {
        found: true,
        provider: 'kinopoisk-dev',
        providerLabel: 'Кинопоиск',
        externalId: movie.id == null ? undefined : String(movie.id),
        sourceUrl: sourceUrl(movie),
        confidence: confidenceFor(movie),
        rating: movie.rating?.kp ?? movie.rating?.imdb ?? null,
        kind,
        title,
        originalTitle: text(movie.alternativeName) || text(movie.enName) || null,
        year: movie.year ?? null,
        country: movie.countries?.map((item) => text(item.name)).filter(Boolean).slice(0, 4).join(', ') || null,
        description: text(movie.description) || text(movie.shortDescription) || null,
        director: directorNames.join(', ') || null,
        genres: movie.genres?.map((genre) => text(genre.name).toLowerCase()).filter(Boolean) ?? [],
        starring: actorNames,
        durationMin: movie.movieLength ?? movie.seriesLength ?? null,
        seasonsCount: episodesPerSeason.length || null,
        episodesPerSeason,
        posterUrl: movie.poster?.previewUrl ?? movie.poster?.url ?? null,
    };
}

function getKinopoiskConfig() {
    const token = process.env.KINOPOISK_DEV_TOKEN?.trim();
    if (!token) return null;
    return {
        token,
        baseUrl: process.env.KINOPOISK_DEV_BASE_URL?.trim() || DEFAULT_BASE_URL,
    };
}

async function kinopoiskJson<T>(path: string, params: URLSearchParams): Promise<T | null> {
    const config = getKinopoiskConfig();
    if (!config) return null;

    try {
        const res = await fetch(`${config.baseUrl}${path}?${params}`, {
            signal: AbortSignal.timeout(15000),
            headers: {
                accept: 'application/json',
                'X-API-KEY': config.token,
            },
        });
        if (!res.ok) return null;
        return (await res.json()) as T;
    } catch {
        return null;
    }
}

async function loadEpisodesPerSeason(movieId: string) {
    const params = new URLSearchParams({
        movieId,
        limit: '50',
        sortField: 'number',
        sortType: '1',
    });
    const json = await kinopoiskJson<KinopoiskSeasonResponse>('/v1.4/season', params);
    return (json?.docs ?? [])
        .sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
        .map((season) => season.episodesCount ?? season.episodes?.length ?? 0)
        .filter((count) => count > 0);
}

export async function lookupKinopoiskCandidates(title: string, kind?: MovieKind): Promise<MovieLookupCandidate[]> {
    const params = new URLSearchParams({
        query: title,
        limit: '8',
    });
    const json = await kinopoiskJson<KinopoiskSearchResponse>('/v1.4/movie/search', params);
    const docs = json?.docs ?? [];
    const candidates: MovieLookupCandidate[] = [];

    for (const doc of docs) {
        const id = doc.id == null ? '' : String(doc.id);
        const baseCandidate = mapKinopoiskMovie(doc);
        if (!baseCandidate) continue;
        if (kind && baseCandidate.kind !== kind) continue;

        const episodesPerSeason = baseCandidate.kind === 'SERIES' && id
            ? await loadEpisodesPerSeason(id)
            : [];
        const candidate = mapKinopoiskMovie(doc, episodesPerSeason);
        if (candidate) candidates.push(candidate);
    }

    return candidates;
}
