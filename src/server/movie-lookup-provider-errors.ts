export type KinopoiskProviderName = 'kinopoisk-dev' | 'kinopoisk-unofficial';

export class MovieLookupQuotaError extends Error {
    constructor(
        public readonly provider: KinopoiskProviderName,
        public readonly status: number,
    ) {
        super(`${provider} quota exhausted (HTTP ${status})`);
        this.name = 'MovieLookupQuotaError';
    }
}

export function isMovieLookupQuotaError(error: unknown): error is MovieLookupQuotaError {
    return error instanceof MovieLookupQuotaError;
}
