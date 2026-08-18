export type MovieDedupeInput = {
    kind?: string | null;
    title: string;
    year: number | string;
};

export function normalizeMovieTitle(value: string) {
    return value
        .normalize('NFKC')
        .toLowerCase()
        .replaceAll('ё', 'е')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function buildMovieDedupeKey({ kind, title, year }: MovieDedupeInput) {
    const normalizedTitle = normalizeMovieTitle(title);
    const normalizedKind = String(kind ?? 'MOVIE').toUpperCase();
    const normalizedYear = Number(year);

    if (!normalizedTitle || !Number.isInteger(normalizedYear)) return '';
    return `${normalizedKind}:${normalizedYear}:${normalizedTitle}`;
}
