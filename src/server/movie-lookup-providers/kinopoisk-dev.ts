import type { MovieKind } from '@/lib/movie-data';
import {
    personProfileSchema,
    type PersonProfile,
} from '@/lib/person-data';
import {
    externalRatingSchema,
    movieCastMemberSchema,
    movieLookupDetailsSchema,
    type ExternalRatings,
    type MovieCastMember,
    type MovieLookupCandidate,
    type MovieLookupDetails,
    type SeriesSeasonMetadata,
} from '@/lib/movie-lookup-types';
import { normalizeSeriesMetadata, seriesMetadataSummary } from '@/lib/series-metadata';

type KinopoiskName = { name?: string | null };
type KinopoiskPerson = {
    id?: number | string | null;
    name?: string | null;
    enName?: string | null;
    photo?: string | null;
    profession?: string | null;
    enProfession?: string | null;
    description?: string | null;
};

type KinopoiskValue = { value?: string | null };
type KinopoiskPersonMovie = {
    id?: number | string | null;
    name?: string | null;
    alternativeName?: string | null;
    enProfession?: string | null;
    description?: string | null;
};
export type KinopoiskPersonProfile = {
    id?: number | string | null;
    name?: string | null;
    enName?: string | null;
    photo?: string | null;
    sex?: string | null;
    growth?: number | null;
    birthday?: string | null;
    death?: string | null;
    birthPlace?: KinopoiskValue[] | null;
    profession?: KinopoiskValue[] | null;
    facts?: KinopoiskValue[] | null;
    movies?: KinopoiskPersonMovie[] | null;
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
    rating?: {
        kp?: number | null;
        imdb?: number | null;
        russianFilmCritics?: number | null;
    } | null;
    votes?: {
        kp?: number | null;
        imdb?: number | null;
        russianFilmCritics?: number | null;
    } | null;
    poster?: { previewUrl?: string | null; url?: string | null } | null;
    countries?: KinopoiskName[] | null;
    genres?: KinopoiskName[] | null;
    persons?: KinopoiskPerson[] | null;
};

type KinopoiskImage = { url?: string | null };
type KinopoiskEpisode = {
    number?: number | null;
    name?: string | null;
    enName?: string | null;
    description?: string | null;
    enDescription?: string | null;
    airDate?: string | null;
    still?: KinopoiskImage | null;
};
export type KinopoiskSeason = {
    number?: number | null;
    name?: string | null;
    enName?: string | null;
    description?: string | null;
    enDescription?: string | null;
    airDate?: string | null;
    duration?: number | null;
    poster?: KinopoiskImage | null;
    episodes?: KinopoiskEpisode[] | null;
};

type KinopoiskSearchResponse = { docs?: KinopoiskMovie[] };
type KinopoiskSeasonResponse = {
    docs?: KinopoiskSeason[];
};

const DEFAULT_BASE_URL = 'https://api.kinopoisk.dev';

function text(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function boundedText(value: unknown) {
    return text(value).slice(0, 300);
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

function isHttpUrl(value: string) {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

function externalId(value: number | string | null | undefined) {
    if (typeof value === 'number') {
        return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
    }

    const normalized = text(value);
    return /^[1-9]\d*$/.test(normalized) && Number.isSafeInteger(Number(normalized))
        ? normalized
        : null;
}

function nullableDate(value: unknown) {
    const candidate = text(value).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
    const date = new Date(`${candidate}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === candidate
        ? candidate
        : null;
}

function stringValues(values: KinopoiskValue[] | null | undefined, max: number) {
    const seen = new Set<string>();
    return (values ?? []).flatMap((item) => {
        const value = boundedText(item.value);
        if (!value || seen.has(value)) return [];
        seen.add(value);
        return [ value ];
    }).slice(0, max);
}

function actingCredits(person: KinopoiskPersonProfile) {
    const seen = new Set<string>();
    return (person.movies ?? []).flatMap((movie) => {
        if (normalize(text(movie.enProfession)) !== 'actor') return [];
        const id = externalId(movie.id);
        if (!id || seen.has(id)) return [];
        seen.add(id);
        return [ { ...movie, externalId: id } ];
    }).slice(0, 2_000);
}

function movieRating(movie: KinopoiskMovie | undefined) {
    const value = movie?.rating?.kp ?? movie?.rating?.imdb;
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10
        ? value
        : null;
}

function rating(value: number | null | undefined, votes: number | null | undefined) {
    const validVotes = typeof votes === 'number'
        && Number.isInteger(votes)
        && votes >= 0
        && votes <= 2_000_000_000
        ? votes
        : null;
    const parsed = externalRatingSchema.safeParse({ value, votes: validVotes });
    return parsed.success ? parsed.data : null;
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

export function mapKinopoiskRichMetadata(movie: KinopoiskMovie): {
    externalRatings: ExternalRatings;
    cast: MovieCastMember[];
} {
    const externalRatings = {
        kinopoisk: rating(movie.rating?.kp, movie.votes?.kp),
        imdb: rating(movie.rating?.imdb, movie.votes?.imdb),
        russianCritics: rating(movie.rating?.russianFilmCritics, movie.votes?.russianFilmCritics),
    };
    const seenIds = new Set<string>();
    const cast: MovieCastMember[] = [];

    for (const person of movie.persons ?? []) {
        if (!personMatches(person, 'актер', 'actor') && !personMatches(person, 'актёр', 'actor')) continue;

        const personId = externalId(person.id);
        if (!personId || seenIds.has(personId)) continue;

        const photo = text(person.photo);
        const parsed = movieCastMemberSchema.safeParse({
            provider: 'kinopoisk-dev',
            externalId: personId,
            name: text(person.name),
            originalName: text(person.enName) || null,
            photoUrl: photo && isHttpUrl(photo) ? photo : null,
            profession: 'actor',
            role: text(person.description) || null,
            order: cast.length,
        });
        if (!parsed.success) continue;

        seenIds.add(personId);
        cast.push(parsed.data);
        if (cast.length === 100) break;
    }

    return { externalRatings, cast };
}

export function mapKinopoiskPerson(
    personExternalId: string,
    person: KinopoiskPersonProfile,
    movieSummaries: KinopoiskMovie[] = [],
): PersonProfile | null {
    const summaries = new Map(
        movieSummaries.flatMap((movie) => {
            const id = externalId(movie.id);
            return id ? [ [ id, movie ] as const ] : [];
        }),
    );
    const localizedName = boundedText(person.name);
    const englishName = boundedText(person.enName);
    const name = localizedName || englishName;
    if (!name) return null;

    const photo = text(person.photo);
    const parsed = personProfileSchema.safeParse({
        provider: 'kinopoisk-dev',
        externalId: personExternalId,
        name,
        originalName: localizedName && englishName ? englishName : null,
        photoUrl: photo && isHttpUrl(photo) ? photo : null,
        sex: boundedText(person.sex) || null,
        growthCm: typeof person.growth === 'number' && Number.isInteger(person.growth)
            ? person.growth
            : null,
        birthDate: nullableDate(person.birthday),
        deathDate: nullableDate(person.death),
        birthPlace: stringValues(person.birthPlace, 100),
        professions: stringValues(person.profession, 100),
        facts: stringValues(person.facts, 100),
        filmography: actingCredits(person).flatMap((credit) => {
            const summary = summaries.get(credit.externalId);
            const title = boundedText(summary?.name)
                || boundedText(credit.name)
                || boundedText(summary?.alternativeName)
                || boundedText(summary?.enName)
                || boundedText(credit.alternativeName);
            if (!title) return [];

            const originalTitle = boundedText(summary?.alternativeName)
                || boundedText(summary?.enName)
                || boundedText(credit.alternativeName)
                || null;
            const poster = text(summary?.poster?.previewUrl) || text(summary?.poster?.url);
            return [ {
                externalId: credit.externalId,
                title,
                originalTitle,
                year: typeof summary?.year === 'number' ? summary.year : null,
                posterUrl: poster && isHttpUrl(poster) ? poster : null,
                type: boundedText(summary?.type) || null,
                rating: movieRating(summary),
                role: boundedText(credit.description) || null,
            } ];
        }),
    });

    return parsed.success ? parsed.data : null;
}

export function mapKinopoiskSeasons(input: KinopoiskSeason[]): SeriesSeasonMetadata[] {
    return normalizeSeriesMetadata(input.map((season) => ({
        number: season.number ?? 0,
        name: season.name ?? null,
        originalName: season.enName ?? null,
        description: season.description ?? null,
        originalDescription: season.enDescription ?? null,
        airDate: season.airDate ?? null,
        durationMin: season.duration ?? null,
        posterUrl: season.poster?.url ?? null,
        episodes: (season.episodes ?? []).map((episode) => ({
            number: episode.number ?? 0,
            name: episode.name ?? null,
            originalName: episode.enName ?? null,
            description: episode.description ?? null,
            originalDescription: episode.enDescription ?? null,
            airDate: episode.airDate ?? null,
            stillUrl: episode.still?.url ?? null,
        })),
    })));
}

function getKinopoiskConfig() {
    const token = process.env.KINOPOISK_DEV_TOKEN?.trim();
    if (!token) return null;
    return {
        token,
        baseUrl: process.env.KINOPOISK_DEV_BASE_URL?.trim() || DEFAULT_BASE_URL,
    };
}

async function kinopoiskJson<T>(
    path: string,
    params?: URLSearchParams,
    signal?: AbortSignal,
): Promise<T | null> {
    const config = getKinopoiskConfig();
    if (!config) return null;

    try {
        const query = params?.size ? `?${params}` : '';
        const res = await fetch(`${config.baseUrl}${path}${query}`, {
            signal: signal ?? AbortSignal.timeout(15000),
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

async function loadKinopoiskSeasons(movieId: string) {
    const params = new URLSearchParams({
        movieId,
        limit: '250',
        sortField: 'number',
        sortType: '1',
    });
    const json = await kinopoiskJson<KinopoiskSeasonResponse>('/v1.4/season', params);
    return json?.docs ?? [];
}

export async function loadKinopoiskPerson(personExternalId: string): Promise<PersonProfile | null> {
    const personId = personExternalId.trim();
    if (!externalId(personId)) return null;

    const person = await kinopoiskJson<KinopoiskPersonProfile>(
        `/v1.4/person/${encodeURIComponent(personId)}`,
    );
    if (!person) return null;

    const ids = actingCredits(person).map((credit) => credit.externalId);
    const summaries: KinopoiskMovie[] = [];
    const chunks = Array.from(
        { length: Math.ceil(ids.length / 100) },
        (_, index) => ids.slice(index * 100, (index + 1) * 100),
    );
    const enrichmentSignal = AbortSignal.timeout(15000);
    let nextChunk = 0;
    await Promise.all(Array.from({ length: Math.min(4, chunks.length) }, async () => {
        while (nextChunk < chunks.length) {
            const chunk = chunks[nextChunk++];
            const params = new URLSearchParams({ limit: String(chunk.length) });
            for (const id of chunk) params.append('id', id);

            const response = await kinopoiskJson<KinopoiskSearchResponse>(
                '/v1.4/movie',
                params,
                enrichmentSignal,
            );
            summaries.push(...(response?.docs ?? []));
        }
    }));

    return mapKinopoiskPerson(personId, person, summaries);
}

export async function lookupKinopoiskCandidates(title: string, kind?: MovieKind): Promise<MovieLookupCandidate[]> {
    const params = new URLSearchParams({
        query: title,
        limit: '8',
    });
    const json = await kinopoiskJson<KinopoiskSearchResponse>('/v1.4/movie/search', params);
    const docs = json?.docs ?? [];
    return docs
        .map((doc) => mapKinopoiskMovie(doc))
        .filter((candidate): candidate is MovieLookupCandidate => Boolean(candidate))
        .filter((candidate) => !kind || candidate.kind === kind);
}

export async function loadKinopoiskCandidate(externalId: string): Promise<MovieLookupDetails | null> {
    const movieId = externalId.trim();
    if (!movieId) return null;

    const [ movie, rawSeasons ] = await Promise.all([
        kinopoiskJson<KinopoiskMovie>(`/v1.4/movie/${encodeURIComponent(movieId)}`),
        loadKinopoiskSeasons(movieId),
    ]);
    if (!movie) return null;

    const seasons = mapKinopoiskSeasons(rawSeasons);
    const candidate = mapKinopoiskMovie(movie, seriesMetadataSummary(seasons).episodesPerSeason);
    if (!candidate) return null;

    return movieLookupDetailsSchema.parse({
        ...candidate,
        ...seriesMetadataSummary(seasons),
        seasons,
        ...mapKinopoiskRichMetadata(movie),
    });
}
