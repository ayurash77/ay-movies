# Detailed Series Episodes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import, persist, and display complete season and episode metadata for series selected from a Kinopoisk lookup result.

**Architecture:** Keep catalog queries on the existing summary columns while storing detailed data in normalized `SeriesSeason` and `SeriesEpisode` rows. Search returns lightweight candidates; selecting one invokes a provider-specific detail loader, and saving replaces a valid detailed snapshot transactionally while preserving old data after provider failures.

**Tech Stack:** TanStack Start/Router, React 19, TypeScript, Zod, Prisma 6, PostgreSQL, Node test runner, Tailwind CSS 4.

**Spec:** `docs/superpowers/specs/2026-08-20-series-episode-metadata-design.md`

## Global Constraints

- `kinopoisk.dev` is primary when `KINOPOISK_DEV_TOKEN` exists; `kinopoiskapiunofficial.tech` is fallback.
- Provider tokens remain server-only and must never be serialized or logged.
- Detailed API requests run only after selecting an exact candidate or refreshing a stored provider ID.
- Existing `seasonsCount` and `episodesPerSeason` remain summary fields and legacy fallback data.
- Existing detailed rows are replaced only by a valid, non-empty season snapshot.
- Users do not manually edit season or episode metadata.
- Card/list queries must not join detailed season or episode rows.
- Every Prisma schema change ships with a migration; production uses `prisma migrate deploy`.

---

## File Structure

- `prisma/schema.prisma`: source fields on `Movie` and normalized season/episode relations.
- `prisma/migrations/20260820170000_series_episode_metadata/migration.sql`: additive production migration.
- `src/lib/movie-lookup-types.ts`: provider-neutral detailed lookup schemas and types.
- `src/lib/series-metadata.ts`: pure snapshot normalization and summary derivation.
- `src/lib/movie-data.ts`: detailed season/episode types exposed by movie details and form state.
- `src/server/movie-lookup-providers/kinopoisk-dev.ts`: lightweight search and detailed `kinopoisk.dev` loader.
- `src/server/movie-lookup-providers/kinopoisk-unofficial.ts`: lightweight search and detailed fallback loader.
- `src/server/movie-lookup.ts`: authenticated candidate-detail dispatch.
- `src/server/movies.ts`: transactional persistence and ordered detail loading.
- `src/components/movies/MovieForm.tsx`: remove visible manual season fields while retaining imported metadata in submitted state.
- `src/components/movies/LookupCandidates.tsx`: selected-candidate loading state.
- `src/components/movies/SeriesSeasons.tsx`: detailed season selector and episode list with legacy fallback.
- `src/routes/movies/new.tsx`: load selected candidate details before filling the form.
- `src/routes/movies/$movieId_.edit.tsx`: exact stored-source refresh and selected detail loading.
- `src/routes/movies/$movieId.tsx`: delegate season rendering to `SeriesSeasons`.
- `scripts/series-metadata.test.ts`: normalization and summary tests.
- `scripts/movie-lookup.test.ts`: provider mapping and detail contract tests.
- `scripts/movie-form-flow.test.ts`: source selection, hidden metadata, and removal of manual fields.
- `scripts/movie-navigation-detail.test.ts`: detailed and legacy episode rendering contract.
- `package.json`: focused test script and inclusion in `pnpm test`.
- `AGENTS.md`, `src/routes/AGENTS.md`, `src/server/AGENTS.md`: handoff documentation.

---

### Task 1: Detailed Metadata Types And Database Schema

**Files:**
- Create: `src/lib/series-metadata.ts`
- Create: `scripts/series-metadata.test.ts`
- Modify: `src/lib/movie-lookup-types.ts`
- Modify: `src/lib/movie-data.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260820170000_series_episode_metadata/migration.sql`
- Modify: `package.json`

**Interfaces:**
- Produces: `SeriesSeasonMetadata`, `SeriesEpisodeMetadata`, `normalizeSeriesMetadata(seasons)`, and `seriesMetadataSummary(seasons)`.
- Produces: Prisma relations `Movie.seriesSeasons`, `SeriesSeason.episodes` and nullable `Movie.metadataProvider`, `Movie.metadataExternalId`, `Movie.metadataUpdatedAt`.

- [ ] **Step 1: Write failing normalization tests**

Add `scripts/series-metadata.test.ts` with cases that prove ordering, duplicate removal, invalid-number removal, empty-string normalization, ISO date validation, and summary derivation:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeSeriesMetadata, seriesMetadataSummary } from '../src/lib/series-metadata';

test('normalizes and orders detailed seasons and episodes', () => {
    const seasons = normalizeSeriesMetadata([
        { number: 2, name: ' Второй ', episodes: [ { number: 2, name: 'B' }, { number: 1, name: ' A ' } ] },
        { number: 1, name: '', episodes: [ { number: 1, name: 'Pilot', airDate: '2022-04-01' } ] },
        { number: 0, episodes: [] },
        { number: 2, name: 'duplicate', episodes: [] },
    ]);

    assert.deepEqual(seasons.map((season) => season.number), [ 1, 2 ]);
    assert.deepEqual(seasons[1].episodes.map((episode) => episode.number), [ 1, 2 ]);
    assert.equal(seasons[0].name, null);
    assert.equal(seasons[0].episodes[0].airDate, '2022-04-01');
    assert.deepEqual(seriesMetadataSummary(seasons), {
        seasonsCount: 2,
        episodesPerSeason: [ 1, 2 ],
    });
});

test('rejects empty snapshots and invalid dates without throwing', () => {
    assert.deepEqual(normalizeSeriesMetadata([]), []);
    assert.equal(normalizeSeriesMetadata([
        { number: 1, episodes: [ { number: 1, airDate: 'not-a-date' } ] },
    ])[0].episodes[0].airDate, null);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm exec tsx --test scripts/series-metadata.test.ts`

Expected: FAIL because `src/lib/series-metadata.ts` does not exist.

- [ ] **Step 3: Define provider-neutral schemas and pure normalization**

In `src/lib/movie-lookup-types.ts`, add schemas with these exact fields:

```ts
export const seriesEpisodeMetadataSchema = z.object({
    number: z.number().int().positive(),
    name: z.string().nullish(),
    originalName: z.string().nullish(),
    description: z.string().nullish(),
    originalDescription: z.string().nullish(),
    airDate: z.string().nullish(),
    stillUrl: z.string().nullish(),
});

export const seriesSeasonMetadataSchema = z.object({
    number: z.number().int().positive(),
    name: z.string().nullish(),
    originalName: z.string().nullish(),
    description: z.string().nullish(),
    originalDescription: z.string().nullish(),
    airDate: z.string().nullish(),
    durationMin: z.number().int().positive().nullish(),
    posterUrl: z.string().nullish(),
    episodes: z.array(seriesEpisodeMetadataSchema),
});

export const movieLookupDetailsSchema = movieLookupCandidateSchema.extend({
    seasons: z.array(seriesSeasonMetadataSchema),
});
```

Export inferred types. Implement `normalizeSeriesMetadata()` in the new helper so it trims nullable text, accepts only `YYYY-MM-DD` dates that round-trip through `Date`, keeps the first positive season/episode number, sorts ascending, and parses through the schemas. Implement `seriesMetadataSummary()` from the normalized array.

Extend `MovieDetails` and `MovieFormFields` in `src/lib/movie-data.ts` with:

```ts
metadataProvider: LookupProvider | null;
metadataExternalId: string | null;
metadataUpdatedAt: string | null;
seriesSeasons: SeriesSeasonMetadata[];
```

Use optional versions of the source fields and `seriesSeasons` in `MovieFormFields`.

- [ ] **Step 4: Add normalized Prisma models and migration**

Add fields and relation to `Movie`:

```prisma
metadataProvider   String?
metadataExternalId String?
metadataUpdatedAt  DateTime?
seriesSeasons      SeriesSeason[]

@@index([metadataProvider, metadataExternalId])
```

Add models:

```prisma
model SeriesSeason {
  id                  String          @id @default(cuid())
  movieId             String
  movie               Movie           @relation(fields: [movieId], references: [id], onDelete: Cascade)
  number              Int
  name                String?
  originalName        String?
  description         String?
  originalDescription String?
  airDate             DateTime?       @db.Date
  durationMin         Int?
  posterUrl           String?
  episodes            SeriesEpisode[]

  @@unique([movieId, number])
  @@index([movieId, number])
}

model SeriesEpisode {
  id                  String       @id @default(cuid())
  seasonId            String
  season              SeriesSeason @relation(fields: [seasonId], references: [id], onDelete: Cascade)
  number              Int
  name                String?
  originalName        String?
  description         String?
  originalDescription String?
  airDate             DateTime?    @db.Date
  stillUrl            String?

  @@unique([seasonId, number])
  @@index([seasonId, number])
}
```

Start PostgreSQL with `pnpm dc:up`, run `pnpm db:migrate:dev --name series_episode_metadata`, and inspect the generated SQL for additive columns, tables, indexes, and cascade foreign keys. Run `pnpm db:generate` if client generation did not run automatically.

- [ ] **Step 5: Add and run the focused test command**

Add `test:series-metadata` to `package.json` and include it in `test` before lookup tests.

Run: `pnpm test:series-metadata && pnpm typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 6: Commit the data foundation**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/movie-lookup-types.ts src/lib/movie-data.ts src/lib/series-metadata.ts scripts/series-metadata.test.ts package.json
git commit -m "feat(series): add detailed episode data model"
```

---

### Task 2: Two-Stage Provider Detail Loading

**Files:**
- Modify: `src/server/movie-lookup-providers/kinopoisk-dev.ts`
- Modify: `src/server/movie-lookup-providers/kinopoisk-unofficial.ts`
- Modify: `src/server/movie-lookup.ts`
- Modify: `scripts/movie-lookup.test.ts`

**Interfaces:**
- Consumes: `MovieLookupDetails`, `normalizeSeriesMetadata()` from Task 1.
- Produces: `loadKinopoiskCandidate(externalId)`, `loadKinopoiskUnofficialCandidate(externalId)`, and authenticated `loadMovieLookupDetails`.

- [ ] **Step 1: Add failing mapper and dispatch tests**

Extend `scripts/movie-lookup.test.ts` with representative season payloads for both providers. Assert the mapped result contains ordered episodes with localized/original titles, descriptions, dates, and stills. Also assert `src/server/movie-lookup.ts` exports `loadMovieLookupDetails` and validates `provider` plus `externalId`.

Example `kinopoisk.dev` assertion:

```ts
assert.deepEqual(mapKinopoiskSeasons([
    {
        number: 1,
        name: 'Первый сезон',
        enName: 'Season One',
        episodes: [ {
            number: 1,
            name: 'Недотепство заразно',
            enName: "Failure's Contagious",
            description: 'Ривер прибывает в Слау-Хаус.',
            airDate: '2022-04-01',
            still: { url: 'https://example.com/episode.jpg' },
        } ],
    },
]), [ {
    number: 1,
    name: 'Первый сезон',
    originalName: 'Season One',
    description: null,
    originalDescription: null,
    airDate: null,
    durationMin: null,
    posterUrl: null,
    episodes: [ {
        number: 1,
        name: 'Недотепство заразно',
        originalName: "Failure's Contagious",
        description: 'Ривер прибывает в Слау-Хаус.',
        originalDescription: null,
        airDate: '2022-04-01',
        stillUrl: 'https://example.com/episode.jpg',
    } ],
} ]);
```

- [ ] **Step 2: Run lookup tests and verify failure**

Run: `pnpm test:lookup`

Expected: FAIL because detailed season mappers and dispatch do not exist.

- [ ] **Step 3: Make provider search lightweight**

Change both `lookup*Candidates()` implementations so search does not fetch staff, movie details, or season endpoints for every result. Map only fields already present in search responses. Keep summary values when supplied directly by search; otherwise leave them empty.

- [ ] **Step 4: Implement `kinopoisk.dev` detail loading**

Define response types for `EpisodeV1_4` and `SeasonV1_4`, including `name`, `enName`, `description`, `enDescription`, `airDate`, `still`, season poster, duration, and `episodes`.

Export:

```ts
export function mapKinopoiskSeasons(input: KinopoiskSeason[]): SeriesSeasonMetadata[];
export async function loadKinopoiskCandidate(externalId: string): Promise<MovieLookupDetails | null>;
```

Load `/v1.4/movie/{id}` for movie details and `/v1.4/season?movieId={id}&limit=250&sortField=number&sortType=1` for seasons. Map and normalize the season snapshot, derive summary counts, then return `movieLookupDetailsSchema.parse(...)`.

- [ ] **Step 5: Implement Unofficial detail loading**

Replace `unknown[]` episode types with fields from the official schema: `seasonNumber`, `episodeNumber`, `nameRu`, `nameEn`, `synopsis`, and `releaseDate`.

Export:

```ts
export function mapKinopoiskUnofficialSeasons(input: UnofficialSeason[]): SeriesSeasonMetadata[];
export async function loadKinopoiskUnofficialCandidate(externalId: string): Promise<MovieLookupDetails | null>;
```

Load movie, staff, and seasons concurrently after selection; map the detailed result and summary counts.

- [ ] **Step 6: Add authenticated detail dispatch with fallback**

In `src/server/movie-lookup.ts`, add:

```ts
const lookupDetailsInputSchema = z.object({
    provider: lookupProviderSchema,
    externalId: z.string().trim().min(1).max(100),
});

export const loadMovieLookupDetails = createServerFn({ method: 'POST' })
    .validator(lookupDetailsInputSchema)
    .handler(async ({ data }) => {
        const { getAuthUser } = await import('./session');
        if (!await getAuthUser()) return { ok: false as const, error: 'Требуется авторизация' };

        const { loadKinopoiskCandidate } = await import('./movie-lookup-providers/kinopoisk-dev');
        const { loadKinopoiskUnofficialCandidate } = await import('./movie-lookup-providers/kinopoisk-unofficial');
        const loaders = data.provider === 'kinopoisk-unofficial'
            ? [ loadKinopoiskUnofficialCandidate, loadKinopoiskCandidate ]
            : [ loadKinopoiskCandidate, loadKinopoiskUnofficialCandidate ];

        for (const load of loaders) {
            const movie = await load(data.externalId);
            if (movie) return { ok: true as const, movie };
        }
        return { ok: false as const, error: 'Не удалось загрузить подробные данные' };
    });
```

For Kinopoisk IDs, try the selected provider first and the other Kinopoisk provider second. Return the provider that actually succeeded. Wikidata returns a clear no-details result so the route can retain its already loaded candidate. Never include token values in errors.

- [ ] **Step 7: Verify and commit provider loading**

Run: `pnpm test:lookup && pnpm typecheck`

Expected: PASS.

```bash
git add src/server/movie-lookup.ts src/server/movie-lookup-providers src/lib/movie-lookup-types.ts scripts/movie-lookup.test.ts
git commit -m "feat(lookup): load detailed series metadata"
```

---

### Task 3: Transactional Movie Persistence And Detail Loading

**Files:**
- Modify: `src/server/movies.ts`
- Modify: `src/lib/movie-data.ts`
- Modify: `scripts/series-metadata.test.ts`

**Interfaces:**
- Consumes: normalized `seriesSeasons` and provider source fields from Tasks 1-2.
- Produces: `seriesSnapshotWriteData(seasons)` pure helper and `MovieDetails.seriesSeasons` ordered for rendering.

- [ ] **Step 1: Add failing persistence-shape tests**

Export a pure helper from `src/lib/series-metadata.ts`:

```ts
export function seriesSnapshotWriteData(seasons: SeriesSeasonMetadata[]) {
    return seasons.map((season) => ({
        number: season.number,
        name: season.name,
        originalName: season.originalName,
        description: season.description,
        originalDescription: season.originalDescription,
        airDate: season.airDate ? new Date(`${season.airDate}T00:00:00.000Z`) : null,
        durationMin: season.durationMin,
        posterUrl: season.posterUrl,
        episodes: {
            create: season.episodes.map((episode) => ({
                number: episode.number,
                name: episode.name,
                originalName: episode.originalName,
                description: episode.description,
                originalDescription: episode.originalDescription,
                airDate: episode.airDate ? new Date(`${episode.airDate}T00:00:00.000Z`) : null,
                stillUrl: episode.stillUrl,
            })),
        },
    }));
}
```

Test nested rows, date conversion, and empty snapshots. Add source-level assertions that `movies.ts` uses `$transaction`, preserves rows when `seriesSeasons` is absent/empty, and includes ordered nested rows in `getMovie`.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `pnpm test:series-metadata`

Expected: FAIL because write data and server transaction are absent.

- [ ] **Step 3: Extend movie validation without reintroducing manual controls**

Add optional fields to `movieFieldsSchema`:

```ts
metadataProvider: lookupProviderSchema.nullish(),
metadataExternalId: z.string().trim().max(100).nullish(),
seriesSeasons: z.array(seriesSeasonMetadataSchema).max(100).optional(),
```

Keep `seasonsCount` and `episodesPerSeason` accepted for legacy preservation. In `toMovieData`, derive summary values from a non-empty normalized snapshot; otherwise retain submitted legacy summaries.

- [ ] **Step 4: Persist snapshots atomically**

For create, use one transaction to create the movie and nested season rows when a valid snapshot exists.

For update:

- update regular movie fields;
- if kind changes away from `SERIES`, delete detailed rows and clear summaries;
- if a non-empty valid snapshot exists, delete old rows then create the new nested snapshot and update source/timestamp in the same transaction;
- if no valid snapshot is submitted, do not delete existing rows or overwrite source/timestamp.

Keep duplicate detection before the transaction and keep notifications outside it so notification failure cannot roll back movie creation.

- [ ] **Step 5: Return ordered detailed data**

Extend `getMovie()` include:

```ts
seriesSeasons: {
    orderBy: { number: 'asc' },
    include: { episodes: { orderBy: { number: 'asc' } } },
},
```

Serialize `Date` values to `YYYY-MM-DD`, normalize remote URLs with existing URL behavior where appropriate, and return source fields plus `seriesSeasons` in `MovieDetails`.

- [ ] **Step 6: Verify and commit persistence**

Run: `pnpm test:series-metadata && pnpm test:dedupe && pnpm typecheck`

Expected: PASS.

```bash
git add src/server/movies.ts src/lib/movie-data.ts src/lib/series-metadata.ts scripts/series-metadata.test.ts
git commit -m "feat(series): persist episode metadata snapshots"
```

---

### Task 4: Candidate Selection And Automatic Form Import

**Files:**
- Modify: `src/components/movies/LookupCandidates.tsx`
- Modify: `src/components/movies/MovieForm.tsx`
- Modify: `src/routes/movies/new.tsx`
- Modify: `src/routes/movies/$movieId_.edit.tsx`
- Modify: `scripts/movie-form-flow.test.ts`

**Interfaces:**
- Consumes: `loadMovieLookupDetails`, source fields, and detailed snapshot from Tasks 2-3.
- Produces: forms that submit imported metadata only after explicit candidate selection.

- [ ] **Step 1: Add failing UI contract tests**

Extend `scripts/movie-form-flow.test.ts` to require:

- both routes call `loadMovieLookupDetails` after selecting a Kinopoisk candidate;
- selected detail sets `metadataProvider`, `metadataExternalId`, and `seriesSeasons` in form defaults;
- the edit route starts with stored source fields and uses them for exact refresh when available;
- `MovieForm.tsx` has no inputs named `seasonsCount` or `episodesPerSeason`;
- `MovieForm.tsx` includes imported source and season data in its submitted `MovieFormFields` object;
- candidate selection exposes a loading/disabled state.

- [ ] **Step 2: Run form tests and verify failure**

Run: `pnpm test:movie-form-flow`

Expected: FAIL on missing detailed selection and visible manual inputs.

- [ ] **Step 3: Preserve imported metadata in form state**

Remove the visible `Сезонов` and `Серии` rows from `MovieForm`. Keep legacy summary values and new source/snapshot values in `defaults`, and copy these exact values into the object passed to `onSubmit`:

```ts
seasonsCount: defaults?.seasonsCount,
episodesPerSeason: defaults?.episodesPerSeason,
metadataProvider: defaults?.metadataProvider,
metadataExternalId: defaults?.metadataExternalId,
seriesSeasons: defaults?.seriesSeasons,
```

- [ ] **Step 4: Load details when applying a candidate**

In both routes, implement `applyLookupCandidate(candidate)`:

- when the candidate already contains a `seasons` snapshot from exact refresh,
  apply it directly without another provider request;
- for `kinopoisk-dev` and `kinopoisk-unofficial` candidates with an ID, call `loadMovieLookupDetails`;
- use the detailed result when successful;
- show a warning and retain the lightweight candidate when detailed seasons are unavailable;
- never clear existing edit-page `seriesSeasons` after a failed detail request;
- merge trailer/watch links exactly as the current edit flow does.

Pass a candidate key to `LookupCandidates` so only the selected card shows `Загрузка…` and all apply buttons are disabled during the request.

- [ ] **Step 5: Prefer exact stored-source refresh on edit**

When `movie.metadataProvider` and `movie.metadataExternalId` exist, `Обновить данные` calls `loadMovieLookupDetails` for that exact source and presents the returned detail as one selectable candidate. When source fields are absent or exact loading fails, fall back to the existing title search and candidate list.

- [ ] **Step 6: Verify and commit form flow**

Run: `pnpm test:movie-form-flow && pnpm test:lookup && pnpm typecheck`

Expected: PASS.

```bash
git add src/components/movies/LookupCandidates.tsx src/components/movies/MovieForm.tsx src/routes/movies/new.tsx 'src/routes/movies/$movieId_.edit.tsx' scripts/movie-form-flow.test.ts
git commit -m "feat(movies): import selected episode details"
```

---

### Task 5: Detailed Series Page

**Files:**
- Create: `src/components/movies/SeriesSeasons.tsx`
- Modify: `src/routes/movies/$movieId.tsx`
- Modify: `scripts/movie-navigation-detail.test.ts`

**Interfaces:**
- Consumes: ordered `MovieDetails.seriesSeasons` and legacy summary fields.
- Produces: Kinopoisk-style season navigation and detailed episode list.

- [ ] **Step 1: Add failing rendering contract tests**

Extend `scripts/movie-navigation-detail.test.ts` to require the new component and assert source contains:

- a horizontal season selector;
- localized date formatting with `Intl.DateTimeFormat('ru-RU', ...)`;
- primary and original episode titles;
- optional description and still image;
- fallback `Серия {episode}` generation from `episodesPerSeason`;
- no duplicated `seasonEpisodes()` implementation in the route.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm test:movie-navigation-detail`

Expected: FAIL because `SeriesSeasons.tsx` does not exist.

- [ ] **Step 3: Build the detailed season component**

Implement `SeriesSeasons({ movie })` with a stable active-season state and these display rules:

- choose detailed rows when `movie.seriesSeasons.length > 0`;
- otherwise generate legacy rows from `seasonsCount` and `episodesPerSeason`;
- season buttons are `size-10`, horizontally scrollable, and do not resize;
- heading is `{N} сезон, {count} серий`;
- primary episode line is `{episode.number}. {name || `Серия ${number}`}`;
- show `originalName` only when non-empty and different from `name`;
- format `airDate` as `01 апреля 2022` in Russian;
- render descriptions with readable line length;
- render a still only when `stillUrl` exists, using a constrained responsive thumbnail so text never overlaps.

- [ ] **Step 4: Integrate without changing the rest of the detail page**

Replace the route-local `seasonEpisodes()` and `SeasonsSection()` with `<SeriesSeasons movie={movie}/>` inside the existing `Сезоны и серии` tab. Keep trailers, details, watch links, comments, rating, header back action, and edit action unchanged.

- [ ] **Step 5: Verify and commit the page**

Run: `pnpm test:movie-navigation-detail && pnpm typecheck`

Expected: PASS.

```bash
git add src/components/movies/SeriesSeasons.tsx 'src/routes/movies/$movieId.tsx' scripts/movie-navigation-detail.test.ts
git commit -m "feat(series): show detailed episode lists"
```

---

### Task 6: Documentation, Full Verification, And Deployment

**Files:**
- Modify: `AGENTS.md`
- Modify: `src/routes/AGENTS.md`
- Modify: `src/server/AGENTS.md`
- Modify: `.env.example` only if the existing Kinopoisk variables are incomplete.

**Interfaces:**
- Consumes: completed feature and migration from Tasks 1-5.
- Produces: current handoff documentation and verified production deployment.

- [ ] **Step 1: Update handoff documentation**

Document normalized episode storage, two-stage lookup, source persistence, automatic-only editing, legacy fallback, and the new test command. Keep secrets out of examples.

- [ ] **Step 2: Run full local verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

Expected: all tests pass, TypeScript exits 0, production build exits 0, and no whitespace errors are reported. The known Prisma browser externalization warning is acceptable only if the build exits 0 and no new client-side Prisma import is present.

- [ ] **Step 3: Review the final diff**

Run:

```bash
git status --short
git diff --stat
git diff -- prisma/schema.prisma src/lib src/server src/components/movies src/routes/movies scripts package.json AGENTS.md
```

Confirm that `.env`, tokens, unrelated files, and generated build output are absent.

- [ ] **Step 4: Commit and push documentation/final integration**

```bash
git add AGENTS.md src/routes/AGENTS.md src/server/AGENTS.md .env.example
git commit -m "docs(series): document episode metadata flow"
git push origin main
```

Skip `.env.example` in `git add` if it did not change.

- [ ] **Step 5: Add the `kinopoisk.dev` token without exposing it**

On the VDS, prompt for `KINOPOISK_DEV_TOKEN` with hidden input, preserve the env file's `deploy:deploy` ownership and mode `600`, then recreate `ay-movies`. Do not print or transmit the token.

- [ ] **Step 6: Deploy and verify production**

Run the repository deployment commands from `AGENTS.md`, then verify:

```bash
ssh -o BatchMode=yes deploy@72.56.8.147 'cd /opt/ayurash && docker compose ps ay-movies'
curl -fsS -o /dev/null -w 'HTTP %{http_code}\n' --max-time 20 https://movies.ayurash.ru
```

Inside the container, check only that both provider variables are non-empty. Expected: container is `Up`, provider checks pass without printing values, and production returns `HTTP 200`.

- [ ] **Step 7: Production smoke test**

Using the authenticated application, update a known series such as `Медленные лошади`, select the Kinopoisk result, save, and verify season 1 displays `Недотепство заразно`, `Failure's Contagious`, and `01 апреля 2022`. Verify an untouched legacy series still renders generic episode rows.
