const GENRE_ALIASES: Record<string, string[]> = {
    'Драма': [ 'драма', 'драмы', 'драматический', 'драматический фильм', 'drama' ],
    'Комедия': [ 'комедия', 'комедийный', 'comedy' ],
    'Триллер': [ 'триллер', 'thriller' ],
    'Боевик': [ 'боевик', 'экшен', 'action' ],
    'Детектив': [ 'детектив', 'детективный', 'mystery' ],
    'Фантастика': [ 'фантастика', 'научная фантастика', 'sci fi', 'sci-fi', 'киберпанк', 'cyberpunk' ],
    'Фэнтези': [ 'фэнтези', 'фентези', 'fantasy' ],
    'Ужасы': [ 'ужасы', 'хоррор', 'horror' ],
    'Мелодрама': [ 'мелодрама', 'романтика', 'romance' ],
    'Приключения': [ 'приключения', 'приключенческий', 'adventure' ],
    'Криминал': [ 'криминал', 'криминальный', 'crime' ],
    'Военный': [ 'военный', 'военное', 'war' ],
    'Исторический': [ 'исторический', 'история', 'history' ],
    'Семейный': [ 'семейный', 'family' ],
    'Анимация': [ 'анимация', 'мультфильм', 'мультфильмы', 'animation' ],
    'Музыкальный': [ 'музыкальный', 'мюзикл', 'music', 'musical' ],
    'Спорт': [ 'спорт', 'спортивный', 'sport' ],
    'Документальный': [ 'документальный', 'documentary' ],
    'Биография': [ 'биография', 'биографический', 'biography' ],
};

function normalizeGenreKey(value: string) {
    return value
        .toLowerCase()
        .replaceAll('ё', 'е')
        .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
        .replace(/\b(фильм|кино)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const GENRE_ALIAS_MAP = new Map(
    Object.entries(GENRE_ALIASES).flatMap(([ genre, aliases ]) =>
        aliases.map((alias) => [ normalizeGenreKey(alias), genre ]),
    ),
);

export function normalizeGenre(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return '';
    return GENRE_ALIAS_MAP.get(normalizeGenreKey(trimmed)) ?? trimmed;
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
