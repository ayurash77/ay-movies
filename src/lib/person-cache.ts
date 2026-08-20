import type { PersonProfile } from './person-data';

export type PersonSnapshotSource = 'fresh-cache' | 'provider' | 'stale-cache' | 'unavailable';

type CachedPersonSnapshot = {
    profile: PersonProfile;
    updatedAt: Date;
};

type ResolvePersonSnapshotInput = {
    cached: CachedPersonSnapshot | null;
    now: Date;
    maxAgeMs: number;
    loadFresh: () => Promise<PersonProfile | null>;
};

export async function resolvePersonSnapshot({
    cached,
    now,
    maxAgeMs,
    loadFresh,
}: ResolvePersonSnapshotInput): Promise<{
    source: PersonSnapshotSource;
    profile: PersonProfile | null;
}> {
    if (cached && now.getTime() - cached.updatedAt.getTime() <= maxAgeMs) {
        return { source: 'fresh-cache', profile: cached.profile };
    }

    const fresh = await loadFresh();
    if (fresh) return { source: 'provider', profile: fresh };
    if (cached) return { source: 'stale-cache', profile: cached.profile };
    return { source: 'unavailable', profile: null };
}
