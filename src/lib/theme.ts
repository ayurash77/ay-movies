export const appThemes = [
    { id: 'ayu', label: 'Ayu' },
    { id: 'catppuccin', label: 'Catppuccin' },
    { id: 'onedark', label: 'One Dark Pro' },
    { id: 'shotmate', label: 'Shotmate' },
] as const;

export type AppTheme = (typeof appThemes)[number]['id'];

const STORAGE_KEY = 'ay-movies:theme';
const DEFAULT_THEME: AppTheme = 'ayu';

function themeKey(userId?: string | null) {
    return userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;
}

export function isAppTheme(value: unknown): value is AppTheme {
    return typeof value === 'string' && appThemes.some((theme) => theme.id === value);
}

export function getStoredTheme(userId?: string | null): AppTheme {
    if (typeof window === 'undefined') return DEFAULT_THEME;
    const stored = window.localStorage.getItem(themeKey(userId));
    return isAppTheme(stored) ? stored : DEFAULT_THEME;
}

export function applyTheme(theme: AppTheme) {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.add('dark');
}

export function storeTheme(theme: AppTheme, userId?: string | null) {
    if (typeof window === 'undefined') return;
    if (userId) window.localStorage.setItem(themeKey(userId), theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
}
