import type { MovieKind } from '@/lib/movie-data';
import type { MovieLookupCandidate } from '@/lib/movie-lookup-types';

type NameValue = { country?: string | null; genre?: string | null };

export type KinopoiskUnofficialMovie = {
    filmId?: number | string | null;
    kinopoiskId?: number | string | null;
    type?: string | null;
    nameRu?: string | null;
    nameEn?: string | null;
    nameOriginal?: string | null;
    year?: number | string | null;
    startYear?: number | null;
    description?: string | null;
    shortDescription?: string | null;
    filmLength?: number | string | null;
    rating?: string | null;
    ratingKinopoisk?: number | null;
    ratingImdb?: number | null;
    webUrl?: string | null;
    posterUrl?: string | null;
    posterUrlPreview?: string | null;
    serial?: boolean | null;
    countries?: NameValue[] | null;
    genres?: NameValue[] | null;
};

export type KinopoiskUnofficialStaff = {
    nameRu?: string | null;
    nameEn?: string | null;
    professionKey?: string | null;
};

type SearchResponse = { films?: KinopoiskUnofficialMovie[] };
type SeasonResponse = {
    items?: Array<{
        number?: number | null;
        episodes?: unknown[] | null;
    }>;
};

const DEFAULT_BASE_URL = 'https://kinopoiskapiunofficial.tech';

function text(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalize(value: string) {
    return value.toLowerCase().replaceAll('ё', 'е').trim();
}

function numberValue(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return null;
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
}

function yearValue(value: unknown) {
    const parsed = numberValue(value);
    return parsed ? Math.trunc(parsed) : null;
}

function durationValue(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
    const raw = text(value);
    if (!raw) return null;
    const parts = raw.split(':').map((part) => Number(part));
    if (parts.length === 2 && parts.every((part) => Number.isFinite(part))) {
        return parts[0] * 60 + parts[1];
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function movieId(movie: KinopoiskUnofficialMovie) {
    const id = movie.kinopoiskId ?? movie.filmId;
    return id == null ? '' : String(id);
}

function sourceUrl(movie: KinopoiskUnofficialMovie) {
    const url = text(movie.webUrl);
    if (url) return url;
    const id = movieId(movie);
    return id ? `https://www.kinopoisk.ru/film/${id}/` : undefined;
}

function detectKind(movie: KinopoiskUnofficialMovie): MovieKind {
    const type = normalize(text(movie.type));
    const genres = movie.genres?.map((genre) => normalize(text(genre.genre))).join(' ') ?? '';
    if (genres.includes('мульт') || genres.includes('аниме')) return 'CARTOON';
    if (movie.serial || type.includes('series') || type.includes('tv_show') || type.includes('mini_series')) {
        return 'SERIES';
    }
    return 'MOVIE';
}

function staffName(staff: KinopoiskUnofficialStaff) {
    return text(staff.nameRu) || text(staff.nameEn);
}

export function mapKinopoiskUnofficialMovie(
    movie: KinopoiskUnofficialMovie,
    staff: KinopoiskUnofficialStaff[] = [],
    episodesPerSeason: number[] = [],
): MovieLookupCandidate | null {
    const title = text(movie.nameRu) || text(movie.nameOriginal) || text(movie.nameEn);
    if (!title) return null;

    const directors = staff
        .filter((person) => text(person.professionKey) === 'DIRECTOR')
        .map(staffName)
        .filter(Boolean)
        .slice(0, 2);
    const actors = staff
        .filter((person) => text(person.professionKey) === 'ACTOR')
        .map(staffName)
        .filter(Boolean)
        .slice(0, 6);

    return {
        found: true,
        provider: 'kinopoisk-unofficial',
        providerLabel: 'Кинопоиск Unofficial',
        externalId: movieId(movie) || undefined,
        sourceUrl: sourceUrl(movie),
        confidence: movie.ratingKinopoisk ? 88 : 82,
        rating: movie.ratingKinopoisk ?? movie.ratingImdb ?? numberValue(movie.rating),
        kind: detectKind(movie),
        title,
        originalTitle: text(movie.nameOriginal) || text(movie.nameEn) || null,
        year: yearValue(movie.year) ?? movie.startYear ?? null,
        country: movie.countries?.map((item) => text(item.country)).filter(Boolean).slice(0, 4).join(', ') || null,
        description: text(movie.description) || text(movie.shortDescription) || null,
        director: directors.join(', ') || null,
        genres: movie.genres?.map((genre) => text(genre.genre).toLowerCase()).filter(Boolean) ?? [],
        starring: actors,
        durationMin: durationValue(movie.filmLength),
        seasonsCount: episodesPerSeason.length || null,
        episodesPerSeason,
        posterUrl: text(movie.posterUrlPreview) || text(movie.posterUrl) || null,
    };
}

function getConfig() {
    const token = process.env.KINOPOISK_UNOFFICIAL_TOKEN?.trim();
    if (!token) return null;
    return {
        token,
        baseUrl: process.env.KINOPOISK_UNOFFICIAL_BASE_URL?.trim() || DEFAULT_BASE_URL,
    };
}

async function getJson<T>(path: string, params?: URLSearchParams): Promise<T | null> {
    const config = getConfig();
    if (!config) return null;
    const query = params ? `?${params}` : '';

    try {
        const res = await fetch(`${config.baseUrl}${path}${query}`, {
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

async function loadMovie(id: string) {
    return getJson<KinopoiskUnofficialMovie>(`/api/v2.2/films/${id}`);
}

async function loadStaff(id: string) {
    return getJson<KinopoiskUnofficialStaff[]>('/api/v1/staff', new URLSearchParams({ filmId: id }));
}

async function loadEpisodesPerSeason(id: string) {
    const json = await getJson<SeasonResponse>(`/api/v2.2/films/${id}/seasons`);
    return (json?.items ?? [])
        .sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
        .map((season) => season.episodes?.length ?? 0)
        .filter((count) => count > 0);
}

export async function lookupKinopoiskUnofficialCandidates(
    title: string,
    kind?: MovieKind,
): Promise<MovieLookupCandidate[]> {
    const search = await getJson<SearchResponse>(
        '/api/v2.1/films/search-by-keyword',
        new URLSearchParams({ keyword: title, page: '1' }),
    );
    const films = search?.films ?? [];
    const candidates: MovieLookupCandidate[] = [];

    for (const film of films.slice(0, 8)) {
        const id = movieId(film);
        const detailed = id ? await loadMovie(id) : null;
        const base = mapKinopoiskUnofficialMovie(detailed ?? film);
        if (!base) continue;
        if (kind && base.kind !== kind) continue;

        const [ staff, episodesPerSeason ] = await Promise.all([
            id ? loadStaff(id) : Promise.resolve([]),
            base.kind === 'SERIES' && id ? loadEpisodesPerSeason(id) : Promise.resolve([]),
        ]);
        const candidate = mapKinopoiskUnofficialMovie(detailed ?? film, staff ?? [], episodesPerSeason);
        if (candidate) candidates.push(candidate);
    }

    return candidates;
}
