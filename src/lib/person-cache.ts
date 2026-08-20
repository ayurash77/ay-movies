import type { PersonProfile, PersonProfileLoadResult } from './person-data';

export type PersonSnapshotSource =
    | 'fresh-cache'
    | 'provider'
    | 'partial-provider'
    | 'stale-cache'
    | 'unavailable';

type CachedPersonSnapshot = {
    profile: PersonProfile;
    updatedAt: Date | null;
};

type ResolvePersonSnapshotInput = {
    cached: CachedPersonSnapshot | null;
    now: Date;
    maxAgeMs: number;
    refreshAttemptedAt?: Date | null;
    retryBackoffMs?: number;
    loadFresh: () => Promise<PersonProfileLoadResult | null>;
};

export async function resolvePersonSnapshot({
    cached,
    now,
    maxAgeMs,
    refreshAttemptedAt = null,
    retryBackoffMs = 0,
    loadFresh,
}: ResolvePersonSnapshotInput): Promise<{
    source: PersonSnapshotSource;
    profile: PersonProfile | null;
}> {
    if (cached?.updatedAt && now.getTime() - cached.updatedAt.getTime() <= maxAgeMs) {
        return { source: 'fresh-cache', profile: cached.profile };
    }
    if (
        refreshAttemptedAt
        && now.getTime() - refreshAttemptedAt.getTime() < retryBackoffMs
    ) {
        return cached
            ? { source: 'stale-cache', profile: cached.profile }
            : { source: 'unavailable', profile: null };
    }

    let fresh: PersonProfileLoadResult | null = null;
    try {
        fresh = await loadFresh();
    } catch {
        fresh = null;
    }
    if (fresh) {
        return {
            source: fresh.complete ? 'provider' : 'partial-provider',
            profile: fresh.profile,
        };
    }
    if (cached) return { source: 'stale-cache', profile: cached.profile };
    return { source: 'unavailable', profile: null };
}
