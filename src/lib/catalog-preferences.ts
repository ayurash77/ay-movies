import { movieSortDirOptions, movieSortOptions, type MovieSort, type MovieSortDir } from './movie-data';

export type CatalogPreferences = {
    groupByOrigin: boolean;
    groupByCountry: boolean;
    groupByGenre: boolean;
    hiddenCountries: string[];
    sort: MovieSort;
    dir: MovieSortDir;
};

const STORAGE_PREFIX = 'ay-movies:catalog';

export const defaultCatalogPreferences: CatalogPreferences = {
    groupByOrigin: true,
    groupByCountry: false,
    groupByGenre: false,
    hiddenCountries: [],
    sort: 'new',
    dir: 'desc',
};

export function catalogPreferenceKey(userId: string | null | undefined, scope: string) {
    return `${STORAGE_PREFIX}:${userId ?? 'guest'}:${scope}`;
}

export function normalizeCatalogPreferences(value: unknown): CatalogPreferences {
    if (!(typeof value === 'object' && value)) return defaultCatalogPreferences;
    const source = value as Partial<CatalogPreferences>;
    return {
        groupByOrigin: typeof source.groupByOrigin === 'boolean'
            ? source.groupByOrigin
            : defaultCatalogPreferences.groupByOrigin,
        groupByCountry: typeof source.groupByCountry === 'boolean'
            ? source.groupByCountry
            : defaultCatalogPreferences.groupByCountry,
        groupByGenre: typeof source.groupByGenre === 'boolean'
            ? source.groupByGenre
            : defaultCatalogPreferences.groupByGenre,
        hiddenCountries: Array.isArray(source.hiddenCountries)
            ? source.hiddenCountries.filter((item): item is string => typeof item === 'string')
            : defaultCatalogPreferences.hiddenCountries,
        sort: movieSortOptions.includes(source.sort as MovieSort)
            ? source.sort as MovieSort
            : defaultCatalogPreferences.sort,
        dir: movieSortDirOptions.includes(source.dir as MovieSortDir)
            ? source.dir as MovieSortDir
            : defaultCatalogPreferences.dir,
    };
}

export function readCatalogPreferences(userId: string | null | undefined, scope: string) {
    if (typeof window === 'undefined') return defaultCatalogPreferences;
    try {
        const stored = window.localStorage.getItem(catalogPreferenceKey(userId, scope));
        return normalizeCatalogPreferences(stored ? JSON.parse(stored) : null);
    } catch {
        return defaultCatalogPreferences;
    }
}

export function storeCatalogPreferences(
    userId: string | null | undefined,
    scope: string,
    preferences: Partial<CatalogPreferences>,
) {
    if (typeof window === 'undefined') return;
    const current = readCatalogPreferences(userId, scope);
    window.localStorage.setItem(
        catalogPreferenceKey(userId, scope),
        JSON.stringify({ ...current, ...preferences }),
    );
}
