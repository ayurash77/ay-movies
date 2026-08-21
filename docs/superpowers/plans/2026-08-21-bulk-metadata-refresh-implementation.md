# Bulk Movie Metadata Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add and run a safe one-time CLI that refreshes the full movie library from Kinopoisk while preserving user-managed data.

**Architecture:** A pure library module owns title normalization, exact candidate selection, and provider-to-database update planning. A server-only refresh service owns Kinopoisk provider calls and transactional Prisma writes. A thin CLI performs dry-run/apply orchestration, rate limiting, filtering, and reporting.

**Tech Stack:** TypeScript 5.7, Node.js 24, tsx, Prisma 6, Zod 4, node:test, existing Kinopoisk.dev and Kinopoisk Unofficial providers.

## Global Constraints

- Default execution is dry-run; database writes require explicit `--apply`.
- Automatically match only identical media kind, exact year, and normalized Russian or original title.
- Preserve manual trailer links, watch links, uploaded posters, ratings, reviews, watch lists, ownership, and user activity.
- Do not create notifications during the refresh.
- Replace only non-empty detailed season, cast, rating, and automatic video snapshots.
- Skip ambiguous matches and duplicate-key conflicts.
- Process records independently so one failure does not abort the run.
- Do not add a cron, admin UI, startup hook, dependency, or Prisma migration.

---

### Task 1: Exact Matching And Update Planning

**Files:**
- Create: `src/lib/movie-metadata-refresh.ts`
- Create: `scripts/movie-metadata-refresh.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `MovieKind`, `MovieLookupCandidate`, `MovieLookupDetails`, `normalizeGenreOptions()`, `normalizeUsableSeriesMetadata()`, `seriesSummaryWriteData()`, and `buildMovieDedupeKey()`.
- Produces: `normalizeMetadataTitle(value)`, `selectExactMetadataCandidate(movie, candidates)`, `isProtectedMoviePoster(url)`, and `buildMovieMetadataRefreshPlan(movie, details)`.

- [ ] **Step 1: Write failing normalization and candidate-selection tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildMovieMetadataRefreshPlan,
    normalizeMetadataTitle,
    selectExactMetadataCandidate,
} from '../src/lib/movie-metadata-refresh';
import type { MovieKind } from '../src/lib/movie-data';
import type {
    MovieLookupCandidate,
    MovieLookupDetails,
    SeriesSeasonMetadata,
} from '../src/lib/movie-lookup-types';

const usableSeasons: SeriesSeasonMetadata[] = [ {
    number: 1,
    name: 'Сезон 1',
    originalName: 'Season 1',
    description: null,
    originalDescription: null,
    airDate: '2010-01-01',
    durationMin: 100,
    posterUrl: null,
    episodes: [
        { number: 1, name: 'Серия 1', originalName: 'Episode 1', description: null, originalDescription: null, airDate: '2010-01-01', stillUrl: null },
        { number: 2, name: 'Серия 2', originalName: 'Episode 2', description: null, originalDescription: null, airDate: '2010-01-08', stillUrl: null },
    ],
} ];

function candidate(overrides: Partial<MovieLookupCandidate> = {}): MovieLookupCandidate {
    return {
        found: true,
        kind: 'MOVIE',
        title: 'Сенна',
        originalTitle: 'Senna',
        year: 2010,
        country: 'Великобритания',
        description: 'Документальный фильм.',
        director: 'Азиф Кападиа',
        genres: [ 'документальный', 'спорт' ],
        starring: [],
        durationMin: 106,
        seasonsCount: null,
        episodesPerSeason: null,
        posterUrl: 'https://image.openmoviedb.com/poster.webp',
        provider: 'kinopoisk-dev',
        providerLabel: 'Кинопоиск',
        externalId: '573209',
        sourceUrl: 'https://www.kinopoisk.ru/film/573209/',
        rating: 8.2,
        confidence: 100,
        ...overrides,
    };
}

type RefreshMovieFixture = {
    id: string;
    kind: MovieKind;
    title: string;
    year: number;
    country: string;
    description: string;
    posterUrl: string | null;
    trailerUrls: string[];
    watchLinks: string[];
    director: string | null;
    genres: string[];
    starring: string[];
    durationMin: number | null;
    seasonsCount: number | null;
    episodesPerSeason: number[];
    metadataProvider: string | null;
    metadataExternalId: string | null;
};

function movie(overrides: Partial<RefreshMovieFixture> = {}): RefreshMovieFixture {
    return {
        id: 'movie-1',
        kind: 'MOVIE',
        title: 'Сенна',
        year: 2010,
        country: 'Великобритания',
        description: 'Старое описание.',
        posterUrl: null,
        trailerUrls: [],
        watchLinks: [],
        director: null,
        genres: [],
        starring: [],
        durationMin: null,
        seasonsCount: null,
        episodesPerSeason: [],
        metadataProvider: null,
        metadataExternalId: null,
        ...overrides,
    };
}

function details(overrides: Partial<MovieLookupDetails> = {}): MovieLookupDetails {
    return {
        ...candidate(),
        seasons: [],
        externalRatings: null,
        cast: [],
        videos: [],
        ...overrides,
    };
}

test('normalizes case, punctuation and yo for exact title matching', () => {
    assert.equal(normalizeMetadataTitle('  Форд против Феррари! '), 'форд против феррари');
    assert.equal(normalizeMetadataTitle('Всё о Еве'), 'все о еве');
});

test('selects one exact Kinopoisk id across provider duplicates', () => {
    const result = selectExactMetadataCandidate(
        { kind: 'MOVIE', title: 'Сенна', year: 2010 },
        [
            candidate({ provider: 'kinopoisk-dev', externalId: '573209' }),
            candidate({ provider: 'kinopoisk-unofficial', externalId: '573209' }),
        ],
    );
    assert.equal(result.status, 'matched');
    if (result.status === 'matched') assert.equal(result.candidate.provider, 'kinopoisk-dev');
});

test('rejects a year mismatch and reports different exact ids as ambiguous', () => {
    assert.equal(selectExactMetadataCandidate(
        { kind: 'MOVIE', title: 'Сенна', year: 2010 },
        [ candidate({ year: 2011 }) ],
    ).status, 'not-found');

    assert.equal(selectExactMetadataCandidate(
        { kind: 'MOVIE', title: 'Сенна', year: 2010 },
        [ candidate({ externalId: '1' }), candidate({ externalId: '2' }) ],
    ).status, 'ambiguous');
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm exec tsx --test scripts/movie-metadata-refresh.test.ts`

Expected: FAIL because `src/lib/movie-metadata-refresh.ts` does not exist.

- [ ] **Step 3: Implement normalization and exact selection**

```ts
export function normalizeMetadataTitle(value: string | null | undefined) {
    return (value ?? '')
        .normalize('NFKC')
        .toLocaleLowerCase('ru-RU')
        .replaceAll('ё', 'е')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

export function selectExactMetadataCandidate(
    movie: MetadataMatchMovie,
    candidates: readonly MovieLookupCandidate[],
): MetadataCandidateSelection {
    const title = normalizeMetadataTitle(movie.title);
    const exact = candidates.filter((candidate) =>
        candidate.externalId
        && candidate.provider !== 'wikidata'
        && candidate.kind === movie.kind
        && candidate.year === movie.year
        && [ candidate.title, candidate.originalTitle ]
            .some((value) => normalizeMetadataTitle(value) === title),
    );
    const byId = new Map(exact.map((candidate) => [ candidate.externalId!, candidate ]));
    if (byId.size === 0) return { status: 'not-found' };
    if (byId.size > 1) return { status: 'ambiguous', candidates: [ ...byId.values() ] };
    const sameId = exact.filter((candidate) => candidate.externalId === byId.keys().next().value);
    return {
        status: 'matched',
        candidate: sameId.find((candidate) => candidate.provider === 'kinopoisk-dev') ?? sameId[0]!,
    };
}
```

- [ ] **Step 4: Write failing update-plan tests**

```ts
test('refresh plan preserves uploaded poster and all manual fields', () => {
    const plan = buildMovieMetadataRefreshPlan(
        movie({
            posterUrl: '/uploads/posters/user.webp',
            trailerUrls: [ 'https://youtube.com/watch?v=manual' ],
            watchLinks: [ 'https://example.com/watch' ],
        }),
        details({ posterUrl: 'https://image.openmoviedb.com/provider.webp' }),
    );
    assert.equal(plan.movie.posterUrl, '/uploads/posters/user.webp');
    assert.deepEqual(plan.movie.trailerUrls, [ 'https://youtube.com/watch?v=manual' ]);
    assert.deepEqual(plan.movie.watchLinks, [ 'https://example.com/watch' ]);
});

test('refresh plan replaces external poster and builds detailed series snapshot', () => {
    const plan = buildMovieMetadataRefreshPlan(
        movie({ kind: 'SERIES', posterUrl: 'https://old.example/poster.webp' }),
        details({ kind: 'SERIES', posterUrl: 'https://new.example/poster.webp', seasons: usableSeasons }),
    );
    assert.equal(plan.movie.posterUrl, 'https://new.example/poster.webp');
    assert.equal(plan.seriesSeasons.length, 1);
    assert.equal(plan.movie.seasonsCount, 1);
    assert.deepEqual(plan.movie.episodesPerSeason, [ 2 ]);
});
```

- [ ] **Step 5: Implement update planning**

`buildMovieMetadataRefreshPlan()` must return:

```ts
type MovieMetadataRefreshPlan = {
    movie: {
        kind: MovieKind;
        title: string;
        year: number;
        country: string;
        description: string;
        posterUrl: string | null;
        trailerUrls: string[];
        watchLinks: string[];
        director: string | null;
        genres: GenreOption[];
        starring: string[];
        durationMin: number | null;
        seasonsCount: number | null;
        episodesPerSeason: number[];
        dedupeKey: string | null;
        metadataProvider: LookupProvider;
        metadataExternalId: string;
        metadataUpdatedAt: Date;
    };
    seriesSeasons: SeriesSeasonMetadata[];
    externalRatings: ExternalRatings | undefined;
    cast: MovieCastMember[] | undefined;
    videos: MovieVideoMetadata[] | undefined;
};
```

Use provider values when non-empty, preserve current required/basic values when absent, preserve `trailerUrls` and `watchLinks` unconditionally, and preserve posters beginning with `/uploads/posters/` or `/posters/`. Normalize provider genres through `normalizeGenreOptions()` and detailed seasons through `normalizeUsableSeriesMetadata()`.

- [ ] **Step 6: Run the focused test and register the package script**

Add to `package.json`:

```json
"test:metadata-refresh": "tsx --test scripts/movie-metadata-refresh.test.ts"
```

Append `pnpm test:metadata-refresh` to the aggregate `test` command.

Run: `pnpm test:metadata-refresh`

Expected: all metadata refresh unit tests PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add src/lib/movie-metadata-refresh.ts scripts/movie-metadata-refresh.test.ts package.json
git commit -m "feat(movies): plan safe metadata refreshes"
```

### Task 2: Provider Resolution And Transactional Persistence

**Files:**
- Create: `src/server/movie-metadata-refresh.ts`
- Modify: `scripts/movie-metadata-refresh.test.ts`

**Interfaces:**
- Consumes: Task 1's `selectExactMetadataCandidate()` and `buildMovieMetadataRefreshPlan()`, existing provider exports, `resolveMovieLookupDetails()`, `writeMovieRichMetadata()`, and `seriesSnapshotWriteData()`.
- Produces: `resolveMovieMetadataRefresh(movie, dependencies?)`, `prepareMovieMetadataRefresh(db, movie, resolved)`, and `applyMovieMetadataRefresh(db, movie, prepared)`.

- [ ] **Step 1: Write failing resolver tests with injected provider functions**

```ts
test('loads a saved Kinopoisk id without title search', async () => {
    let searches = 0;
    const result = await resolveMovieMetadataRefresh(
        movie({ metadataProvider: 'kinopoisk-dev', metadataExternalId: '573209' }),
        {
            search: async () => { searches += 1; return []; },
            load: async () => details({ externalId: '573209' }),
        },
    );
    assert.equal(searches, 0);
    assert.equal(result.status, 'matched-by-id');
});

test('searches records without a Kinopoisk id and preserves ambiguity', async () => {
    const result = await resolveMovieMetadataRefresh(movie(), {
        search: async () => [ candidate({ externalId: '1' }), candidate({ externalId: '2' }) ],
        load: async () => details(),
    });
    assert.equal(result.status, 'ambiguous');
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm test:metadata-refresh`

Expected: FAIL because `resolveMovieMetadataRefresh` is not implemented.

- [ ] **Step 3: Implement dependency-injected resolution**

```ts
export type MovieMetadataRefreshDependencies = {
    search(title: string, kind: MovieKind): Promise<MovieLookupCandidate[]>;
    load(source: { provider: 'kinopoisk-dev' | 'kinopoisk-unofficial'; externalId: string }): Promise<MovieLookupDetails | null>;
};

export async function resolveMovieMetadataRefresh(
    movie: MovieMetadataRefreshRecord,
    dependencies = productionDependencies,
): Promise<MovieMetadataRefreshResolution> {
    const savedSource = savedKinopoiskSource(movie);
    if (savedSource) {
        const details = await dependencies.load(savedSource);
        return details
            ? { status: 'matched-by-id', details }
            : { status: 'failed', reason: 'saved-source-details-unavailable' };
    }
    const selection = selectExactMetadataCandidate(movie, await dependencies.search(movie.title, movie.kind));
    if (selection.status !== 'matched') return selection;
    const details = await dependencies.load({
        provider: selection.candidate.provider as 'kinopoisk-dev' | 'kinopoisk-unofficial',
        externalId: selection.candidate.externalId!,
    });
    return details
        ? { status: 'matched-by-search', details }
        : { status: 'failed', reason: 'candidate-details-unavailable' };
}
```

The production adapter must search both Kinopoisk providers concurrently, load the selected provider first through `resolveMovieLookupDetails()`, use the other Kinopoisk provider as fallback, and append Kinopoisk Unofficial videos when the detailed response has none.

- [ ] **Step 4: Write failing duplicate and persistence tests**

Use a transaction-shaped fake to assert:

```ts
test('prepare reports a dedupe conflict before starting a transaction', async () => {
    const db = createPersistenceFake('other');
    const result = await prepareMovieMetadataRefresh(db, movie(), details());
    assert.deepEqual(result, { status: 'duplicate-conflict', duplicateId: 'other' });
    assert.equal(db.calls.transactions, 0);
});

test('apply replaces non-empty seasons and delegates rich snapshots', async () => {
    const db = createPersistenceFake();
    const prepared = await prepareMovieMetadataRefresh(
        db,
        movie({ kind: 'SERIES' }),
        details({ kind: 'SERIES', seasons: usableSeasons }),
    );
    assert.equal(prepared.status, 'ready');
    if (prepared.status !== 'ready') return;
    const result = await applyMovieMetadataRefresh(
        db,
        movie({ kind: 'SERIES' }),
        prepared,
    );
    assert.equal(result.status, 'updated');
    assert.equal(db.calls.seriesDeleteMany, 1);
    assert.equal(db.calls.movieUpdate, 1);
});
```

Define the transaction fake immediately above these tests:

```ts
function createPersistenceFake(duplicateId: string | null = null) {
    const calls = { transactions: 0, seriesDeleteMany: 0, movieUpdate: 0 };
    const tx = {
        seriesSeason: {
            deleteMany: async () => { calls.seriesDeleteMany += 1; },
        },
        movie: {
            update: async () => { calls.movieUpdate += 1; },
        },
        person: { upsert: async () => ({ id: 'person-1' }) },
        moviePersonCredit: { deleteMany: async () => {}, createMany: async () => {} },
        movieVideo: { deleteMany: async () => {}, createMany: async () => {} },
    };
    return {
        calls,
        movie: {
            findUnique: async () => duplicateId ? { id: duplicateId } : null,
        },
        $transaction: async <T>(run: (transaction: typeof tx) => Promise<T>) => {
            calls.transactions += 1;
            return run(tx);
        },
    };
}
```

- [ ] **Step 5: Implement preparation and transactional persistence**

`prepareMovieMetadataRefresh()` builds the Task 1 plan and queries `Movie.dedupeKey`; if the key belongs to another ID, it returns `duplicate-conflict`, otherwise it returns `{ status: 'ready', plan }`. This preparation runs in both dry-run and apply modes.

`applyMovieMetadataRefresh()` accepts only a prepared `ready` result. Inside one Prisma transaction:

1. Delete and recreate detailed seasons only when the normalized new snapshot is non-empty.
2. Update basic/provider fields from the Task 1 plan.
3. Call `writeMovieRichMetadata()` with `importSucceeded: true` and the planned ratings, cast, and videos.
4. Return `updated` only after the transaction commits.

- [ ] **Step 6: Run focused and existing persistence tests**

Run: `pnpm test:metadata-refresh && pnpm test:series-metadata && pnpm test:rich-metadata`

Expected: all tests PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/server/movie-metadata-refresh.ts scripts/movie-metadata-refresh.test.ts
git commit -m "feat(movies): refresh provider metadata transactionally"
```

### Task 3: Dry-Run And Apply CLI

**Files:**
- Create: `scripts/refresh-movie-metadata.ts`
- Modify: `scripts/movie-metadata-refresh.test.ts`
- Modify: `package.json`
- Modify: `src/server/AGENTS.md`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: Task 2's `resolveMovieMetadataRefresh()`, `prepareMovieMetadataRefresh()`, and `applyMovieMetadataRefresh()`.
- Produces: `parseMetadataRefreshArgs(argv)`, `runMovieMetadataRefresh(options, dependencies?)`, and package commands `db:refresh-movie-metadata` / `db:refresh-movie-metadata:apply`.

- [ ] **Step 1: Write failing argument and dry-run tests**

```ts
test('CLI defaults to dry-run and parses filters', () => {
    assert.deepEqual(parseMetadataRefreshArgs([ '--limit=5', '--movie-id=abc', '--delay-ms=0' ]), {
        apply: false,
        limit: 5,
        movieId: 'abc',
        delayMs: 0,
    });
});

test('dry-run resolves every selected movie without writing', async () => {
    let applyCalls = 0;
    const dependencies = {
        listMovies: async () => [ movie(), movie({ id: 'second' }) ],
        resolve: async () => ({ status: 'matched-by-search' as const, details: details() }),
        prepare: async () => ({ status: 'ready' as const, plan: buildMovieMetadataRefreshPlan(movie(), details()) }),
        apply: async () => { applyCalls += 1; return { status: 'updated' as const }; },
        sleep: async () => {},
        log: () => {},
    };
    const report = await runMovieMetadataRefresh(
        { apply: false, limit: undefined, movieId: undefined, delayMs: 0 },
        dependencies,
    );
    assert.equal(applyCalls, 0);
    assert.equal(report.ready, 2);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm test:metadata-refresh`

Expected: FAIL because CLI exports do not exist.

- [ ] **Step 3: Implement CLI orchestration and report**

Use `node:util.parseArgs()` with strict validation:

```ts
type MetadataRefreshOptions = {
    apply: boolean;
    limit?: number;
    movieId?: string;
    delayMs: number;
};

type MetadataRefreshReport = {
    total: number;
    ready: number;
    matchedById: number;
    matchedBySearch: number;
    updated: number;
    notFound: number;
    ambiguous: number;
    duplicateConflict: number;
    failed: number;
};
```

Default `delayMs` to `1000`. Select movies ordered by `createdAt` and `id`, apply `movieId` and `limit` filters in Prisma, process sequentially, resolve and prepare every record in both modes, call apply only with `--apply`, print one sanitized status line per record, continue after errors, print the final report, and always disconnect Prisma in `finally`.

- [ ] **Step 4: Register commands and operational documentation**

Add to `package.json`:

```json
"db:refresh-movie-metadata": "tsx scripts/refresh-movie-metadata.ts",
"db:refresh-movie-metadata:apply": "tsx scripts/refresh-movie-metadata.ts --apply"
```

Document in `src/server/AGENTS.md` that the script reuses provider snapshots and never runs automatically. Document in root `AGENTS.md` the production dry-run/apply commands and mandatory backup before apply.

- [ ] **Step 5: Run focused tests and CLI help/limited dry-run locally**

Run: `pnpm test:metadata-refresh`

Expected: PASS.

Run: `pnpm db:refresh-movie-metadata -- --limit=1 --delay-ms=0`

Expected: either one `ready`/skip result followed by a report, or a clear local database/provider configuration error without any write.

- [ ] **Step 6: Commit Task 3**

```bash
git add scripts/refresh-movie-metadata.ts scripts/movie-metadata-refresh.test.ts package.json src/server/AGENTS.md AGENTS.md
git commit -m "feat(movies): add bulk metadata refresh CLI"
```

### Task 4: Verification, Deployment, And One-Time Production Refresh

**Files:**
- Verify only: no source edits expected.

**Interfaces:**
- Consumes: package commands from Task 3 and the existing infra deploy/backup scripts.
- Produces: committed application code, a production dry-run report, a fresh backup, an applied refresh report, and database verification counts.

- [ ] **Step 1: Run the full local verification suite**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

Expected: all tests PASS, TypeScript reports no errors, Vite production build succeeds, and `git diff --check` prints nothing.

- [ ] **Step 2: Review and commit any verification-only corrections**

If verification required source corrections, rerun the failing command and create a new commit without amending earlier commits:

```bash
git add src/lib/movie-metadata-refresh.ts src/server/movie-metadata-refresh.ts scripts/movie-metadata-refresh.test.ts scripts/refresh-movie-metadata.ts package.json src/server/AGENTS.md AGENTS.md
git commit -m "fix(movies): harden bulk metadata refresh"
```

Expected: `git status --short` is empty after the commit.

- [ ] **Step 3: Push and deploy the tested source**

Run:

```bash
git push origin main
/Users/ayurash/Development/_Projects/ayurash-infra/scripts/deploy-app-source.sh ay-movies /Users/ayurash/Development/_Projects/ay-movies
```

Expected: push succeeds and the `ay-movies` container becomes healthy.

- [ ] **Step 4: Run the complete production dry-run**

Run:

```bash
ssh deploy@72.56.8.147 'cd /opt/ayurash && docker compose exec -T ay-movies pnpm db:refresh-movie-metadata'
```

Expected: no writes; report totals equal the number of selected Movie rows. Inspect every `ambiguous`, `duplicate-conflict`, and `failed` line before apply.

- [ ] **Step 5: Create and verify the pre-refresh backup**

Run:

```bash
ssh deploy@72.56.8.147 'sudo systemctl start ayurash-backup.service && sudo systemctl --no-pager --full status ayurash-backup.service'
```

Expected: `ayurash-backup.service` exits successfully after creating the encrypted backup.

- [ ] **Step 6: Apply the production refresh**

Run:

```bash
ssh deploy@72.56.8.147 'cd /opt/ayurash && docker compose exec -T ay-movies pnpm db:refresh-movie-metadata:apply'
```

Expected: only `matched-by-id` and `matched-by-search` records without conflicts are updated; the process exits zero even when individual records are safely skipped.

- [ ] **Step 7: Verify database enrichment and application health**

Run a read-only Prisma verification script inside the container that prints counts for:

```ts
await Promise.all([
    prisma.movie.count(),
    prisma.movie.count({ where: { metadataExternalId: { not: null } } }),
    prisma.seriesSeason.count(),
    prisma.seriesEpisode.count(),
    prisma.moviePersonCredit.count(),
    prisma.movie.count({ where: { kinopoiskRating: { not: null } } }),
    prisma.movieVideo.count(),
]);
```

Then run: `curl -fsS https://movies.ayurash.ru/ >/dev/null`

Expected: enrichment counts are non-decreasing, the application returns HTTP 200, and `docker compose ps ay-movies` shows the service up.

- [ ] **Step 8: Record final repository state**

Run:

```bash
git status --short --branch
git log -4 --oneline
```

Expected: local `main` is clean and synchronized with `origin/main`.
