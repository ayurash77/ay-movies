import type { MovieKind } from '@/lib/movie-data';
import {
    personProfileSchema,
    type PersonProfile,
    type PersonProfileLoadResult,
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

function record(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function array(value: unknown) {
    return Array.isArray(value) ? value : [];
}

function nullableString(value: unknown) {
    return value == null || typeof value === 'string';
}

function nullableNumber(value: unknown) {
    return value == null || (typeof value === 'number' && Number.isFinite(value));
}

function personMovieShape(value: unknown) {
    const data = record(value);
    return Boolean(
        data
        && externalId(data.id)
        && nullableString(data.name)
        && nullableString(data.alternativeName)
        && nullableString(data.enProfession)
        && nullableString(data.description),
    );
}

function validPersonPayload(value: unknown): (Record<string, unknown> & { movies: unknown[] }) | null {
    const person = record(value);
    if (
        !person
        || !externalId(person.id)
        || !(boundedText(person.name) || boundedText(person.enName))
        || !Array.isArray(person.movies)
    ) {
        return null;
    }
    return person as Record<string, unknown> & { movies: unknown[] };
}

function movieSummaryShape(value: unknown) {
    const data = record(value);
    if (!data || !externalId(data.id)) return false;
    if (
        !nullableString(data.name)
        || !nullableString(data.alternativeName)
        || !nullableString(data.enName)
        || !nullableString(data.type)
        || !nullableNumber(data.year)
    ) {
        return false;
    }

    const poster = data.poster == null ? null : record(data.poster);
    if (data.poster != null && (!poster
        || !nullableString(poster.previewUrl)
        || !nullableString(poster.url))) {
        return false;
    }

    const ratingData = data.rating == null ? null : record(data.rating);
    return data.rating == null || Boolean(
        ratingData
        && nullableNumber(ratingData.kp)
        && nullableNumber(ratingData.imdb),
    );
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

function externalId(value: unknown) {
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

function stringValues(values: unknown, max: number) {
    const seen = new Set<string>();
    return array(values).flatMap((item) => {
        const value = boundedText(record(item)?.value);
        if (!value || seen.has(value)) return [];
        seen.add(value);
        return [ value ];
    }).slice(0, max);
}

function actingCredits(person: unknown) {
    const seen = new Set<string>();
    return array(record(person)?.movies).flatMap((value) => {
        const movie = record(value);
        if (!movie || normalize(text(movie.enProfession)) !== 'actor') return [];
        const id = externalId(movie.id);
        if (!id || seen.has(id)) return [];
        seen.add(id);
        return [ {
            externalId: id,
            name: text(movie.name) || null,
            alternativeName: text(movie.alternativeName) || null,
            description: text(movie.description) || null,
        } ];
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
    person: unknown,
    movieSummaries: unknown = [],
): PersonProfile | null {
    const personData = record(person);
    if (!personData) return null;

    const summaries = new Map(
        array(movieSummaries).flatMap((value) => {
            const movie = record(value) as KinopoiskMovie | null;
            if (!movie) return [];
            const id = externalId(movie.id);
            return id ? [ [ id, movie ] as const ] : [];
        }),
    );
    const localizedName = boundedText(personData.name);
    const englishName = boundedText(personData.enName);
    const name = localizedName || englishName;
    if (!name) return null;

    const photo = text(personData.photo);
    const parsed = personProfileSchema.safeParse({
        provider: 'kinopoisk-dev',
        externalId: personExternalId,
        name,
        originalName: localizedName && englishName ? englishName : null,
        photoUrl: photo && isHttpUrl(photo) ? photo : null,
        sex: boundedText(personData.sex) || null,
        growthCm: typeof personData.growth === 'number' && Number.isInteger(personData.growth)
            ? personData.growth
            : null,
        birthDate: nullableDate(personData.birthday),
        deathDate: nullableDate(personData.death),
        birthPlace: stringValues(personData.birthPlace, 100),
        professions: stringValues(personData.profession, 100),
        facts: stringValues(personData.facts, 100),
        filmography: actingCredits(personData).flatMap((credit) => {
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

export async function loadKinopoiskPerson(
    personExternalId: string,
): Promise<PersonProfileLoadResult | null> {
    const personId = personExternalId.trim();
    if (!externalId(personId)) return null;

    const person = await kinopoiskJson<unknown>(
        `/v1.4/person/${encodeURIComponent(personId)}`,
    );
    const personData = validPersonPayload(person);
    if (!personData) return null;

    let complete = personData.movies.every(personMovieShape);
    const ids = actingCredits(personData).map((credit) => credit.externalId);
    const summaries: unknown[] = [];
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

            const response = await kinopoiskJson<unknown>(
                '/v1.4/movie',
                params,
                enrichmentSignal,
            );
            const docsValue = record(response)?.docs;
            if (!Array.isArray(docsValue)) {
                complete = false;
                continue;
            }

            const validDocs = docsValue.filter(movieSummaryShape);
            if (validDocs.length !== docsValue.length) complete = false;
            const returnedIds = new Set(validDocs.flatMap((movie) => {
                const id = externalId(record(movie)?.id);
                return id ? [ id ] : [];
            }));
            if (!chunk.every((id) => returnedIds.has(id))) complete = false;
            summaries.push(...validDocs);
        }
    }));

    const profile = mapKinopoiskPerson(personId, personData, summaries);
    return profile ? { profile, complete } : null;
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
