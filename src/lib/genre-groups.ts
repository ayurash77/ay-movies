type GenreRule = {
    genre: string;
    patterns: Array<string | RegExp>;
};

export const GENRE_OPTIONS = [
    'Анимация',
    'Боевик',
    'Детектив',
    'Драма',
    'Комедия',
    'Криминал',
    'Мелодрама',
    'Приключения',
    'Триллер',
    'Ужасы',
    'Фантастика',
    'Фэнтези',
] as const;

export type GenreOption = (typeof GENRE_OPTIONS)[number];

export const STANDARD_GENRES = [
    ...GENRE_OPTIONS,
    'Другое',
] as const;

const GENRE_RULES: GenreRule[] = [
    { genre: 'Анимация', patterns: [ 'анимац', 'мульт', 'animation' ] },
    { genre: 'Фантастика', patterns: [ 'фантаст', 'киберпанк', 'кинофантастика', 'sci fi', 'sci-fi', 'science fiction', 'cyberpunk' ] },
    { genre: 'Фэнтези', patterns: [ 'фэнтези', 'фентези', 'fantasy' ] },
    { genre: 'Ужасы', patterns: [ 'ужас', 'хоррор', 'horror' ] },
    { genre: 'Триллер', patterns: [ 'триллер', 'thriller', 'саспенс' ] },
    { genre: 'Детектив', patterns: [ 'детектив', 'тайна', 'загадк', 'mystery', 'расслед' ] },
    { genre: 'Криминал', patterns: [ 'криминал', 'crime', 'ограблен', 'нуар', 'gangster' ] },
    { genre: 'Боевик', patterns: [ 'боевик', 'экшн', 'action' ] },
    { genre: 'Комедия', patterns: [ 'комед', 'comedy', 'сатира', 'трагикомед' ] },
    { genre: 'Мелодрама', patterns: [ 'мелодрам', 'романтическ', 'романтика', 'romance' ] },
    { genre: 'Приключения', patterns: [ 'приключ', 'adventure', 'вестерн', 'путешеств' ] },
    { genre: 'Драма', patterns: [ 'драма', 'драмы', 'драмат', 'биограф', 'истор', 'военн', 'спорт', 'взрослен', 'семейн', 'drama', 'biography', 'history', 'war', 'sport', 'family' ] },
];

function normalizeGenreKey(value: string) {
    return value
        .toLowerCase()
        .replaceAll('ё', 'е')
        .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
        .replace(/\b(фильм|кино)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function normalizeGenre(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return '';
    const key = normalizeGenreKey(trimmed);
    const rule = GENRE_RULES.find(({ patterns }) =>
        patterns.some((pattern) =>
            typeof pattern === 'string'
                ? key.includes(normalizeGenreKey(pattern))
                : pattern.test(key),
        ),
    );
    return rule?.genre ?? 'Другое';
}

export function isGenreOption(value: string): value is GenreOption {
    return (GENRE_OPTIONS as readonly string[]).includes(value);
}

export function normalizeGenreOptions(genres: string[]) {
    const normalized = genres.map(normalizeGenre).filter(isGenreOption);
    return [ ...new Set(normalized) ];
}

export function movieGenreGroups(genres: string[]) {
    const normalized = genres.map(normalizeGenre).filter(Boolean);
    return normalized.length ? [ ...new Set(normalized) ] : [ 'Без жанра' ];
}

export function groupMoviesByGenres<T extends { genres: string[] }>(movies: T[]) {
    const groups = new Map<string, T[]>();

    for (const movie of movies) {
        for (const genre of movieGenreGroups(movie.genres)) {
            groups.set(genre, [ ...(groups.get(genre) ?? []), movie ]);
        }
    }

    return [ ...groups.entries() ].sort(([ a ], [ b ]) => a.localeCompare(b, 'ru'));
}
