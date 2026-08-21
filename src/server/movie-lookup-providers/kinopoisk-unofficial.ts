import type { MovieKind } from '@/lib/movie-data';
import {
    kinopoiskExternalIdSchema,
    movieLookupDetailsSchema,
    type MovieLookupCandidate,
    type MovieLookupDetails,
    type SeriesSeasonMetadata,
} from '@/lib/movie-lookup-types';
import { normalizeSeriesMetadata, seriesMetadataSummary } from '@/lib/series-metadata';
import {
    normalizeMovieVideoSnapshot,
    type MovieVideoMetadata,
} from '@/lib/movie-videos';

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
type KinopoiskUnofficialEpisode = {
    seasonNumber?: number | null;
    episodeNumber?: number | null;
    nameRu?: string | null;
    nameEn?: string | null;
    synopsis?: string | null;
    releaseDate?: string | null;
};
export type UnofficialSeason = {
    number?: number | null;
    episodes?: KinopoiskUnofficialEpisode[] | null;
};
type SeasonResponse = {
    items?: UnofficialSeason[];
};
export type KinopoiskUnofficialVideo = {
    url?: string | null;
    name?: string | null;
    site?: string | null;
};
type VideoResponse = {
    items?: KinopoiskUnofficialVideo[] | null;
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
    if (typeof id === 'number') {
        return Number.isSafeInteger(id) && id > 0 ? String(id) : '';
    }
    const parsed = kinopoiskExternalIdSchema.safeParse(id);
    return parsed.success ? parsed.data : '';
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

export function mapKinopoiskUnofficialSeasons(input: UnofficialSeason[]): SeriesSeasonMetadata[] {
    return normalizeSeriesMetadata(input.map((season) => ({
        number: season.number ?? season.episodes?.[0]?.seasonNumber ?? 0,
        name: null,
        originalName: null,
        description: null,
        originalDescription: null,
        airDate: null,
        durationMin: null,
        posterUrl: null,
        episodes: (season.episodes ?? []).map((episode) => ({
            number: episode.episodeNumber ?? 0,
            name: episode.nameRu ?? null,
            originalName: episode.nameEn ?? null,
            description: episode.synopsis ?? null,
            originalDescription: null,
            airDate: episode.releaseDate ?? null,
            stillUrl: null,
        })),
    })));
}

export function mapKinopoiskUnofficialVideos(
    items: KinopoiskUnofficialVideo[],
): MovieVideoMetadata[] {
    const trailerPattern = /трейлер|trailer/i;
    const teaserPattern = /тизер|teaser/i;

    return normalizeMovieVideoSnapshot(items.flatMap((item, position) => {
        const title = text(item.name);
        const kind = trailerPattern.test(title)
            ? 'TRAILER' as const
            : teaserPattern.test(title) ? 'TEASER' as const : null;
        if (!kind) return [];

        return [ {
            provider: 'kinopoisk-unofficial' as const,
            site: text(item.site) || 'UNKNOWN',
            title,
            kind,
            url: text(item.url),
            position,
        } ];
    }));
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
    return json?.items ?? [];
}

export async function loadKinopoiskUnofficialVideos(
    externalId: string,
): Promise<MovieVideoMetadata[]> {
    const parsedId = kinopoiskExternalIdSchema.safeParse(externalId);
    if (!parsedId.success) return [];
    const json = await getJson<VideoResponse>(`/api/v2.2/films/${parsedId.data}/videos`);
    return mapKinopoiskUnofficialVideos(json?.items ?? []);
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
    return films.slice(0, 8)
        .map((film) => mapKinopoiskUnofficialMovie(film))
        .filter((candidate): candidate is MovieLookupCandidate => Boolean(candidate))
        .filter((candidate) => !kind || candidate.kind === kind);
}

export async function loadKinopoiskUnofficialCandidate(externalId: string): Promise<MovieLookupDetails | null> {
    const parsedId = kinopoiskExternalIdSchema.safeParse(externalId);
    if (!parsedId.success) return null;
    const id = parsedId.data;

    const [ movie, staff, rawSeasons, videos ] = await Promise.all([
        loadMovie(id),
        loadStaff(id),
        loadEpisodesPerSeason(id),
        loadKinopoiskUnofficialVideos(id),
    ]);
    if (!movie) return null;

    const seasons = mapKinopoiskUnofficialSeasons(rawSeasons);
    const candidate = mapKinopoiskUnofficialMovie(movie, staff ?? [], seriesMetadataSummary(seasons).episodesPerSeason);
    if (!candidate) return null;

    return movieLookupDetailsSchema.parse({
        ...candidate,
        ...seriesMetadataSummary(seasons),
        seasons,
        videos,
    });
}
