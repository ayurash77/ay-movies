# Movie Details, People, Ratings, And Reviews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persisted provider ratings and visual cast data to movie details, cached actor profiles with complete filmography, and avatar-based user reviews while removing duplicated description metadata.

**Architecture:** Extend the detailed lookup DTO with optional ratings and cast snapshots, then persist valid snapshots transactionally beside the existing movie metadata. Store compact people and local credits in normalized tables; lazily enrich and cache complete person profiles and filmographies for seven days. Keep the physical `Comment` table for compatibility while replacing its server/UI contract with reviews.

**Tech Stack:** TanStack Start/Router, React 19, TypeScript, Prisma 6/PostgreSQL, Zod 4, Tailwind CSS 4, Node test runner.

## Global Constraints

- Keep provider tokens server-only; never log or serialize them.
- `kinopoisk.dev` is the rich ratings/cast/person source; other providers may omit these optional fields.
- Movie detail rendering must not call an external provider.
- Failed or partial refreshes must preserve existing ratings, cast, person cache, and episode snapshots.
- Existing comments and `starring` strings remain compatible and are never discarded by migration.
- Provider images remain remote and are not copied to the user-upload S3 bucket.
- Mobile inputs stay at least 16px and all fixed-format cards keep stable dimensions.
- Each completed task gets a conventional commit and `git push origin main`.

---

### Task 1: Provider-Neutral Ratings And Cast DTOs

**Files:**
- Modify: `src/lib/movie-lookup-types.ts`
- Modify: `src/server/movie-lookup-providers/kinopoisk-dev.ts`
- Modify: `scripts/movie-lookup.test.ts`

**Interfaces:**
- Produces: `ExternalRatings`, `MovieCastMember`, `externalRatingsSchema`, `movieCastMemberSchema`.
- Extends: `MovieLookupDetails` with `externalRatings` and `cast`; lightweight `MovieLookupCandidate` remains unchanged.

- [ ] **Step 1: Write failing mapper and schema tests**

Add a test payload with KP/IMDb/critic scores, votes, actor IDs, photos, and roles:

```ts
test('kinopoisk details map ratings, votes, and rich cast', () => {
    const rich = mapKinopoiskRichMetadata({
        id: 1331649,
        rating: { kp: 7.894, imdb: 8.3, russianFilmCritics: 100 },
        votes: { kp: 42572, imdb: 144000, russianFilmCritics: 7 },
        persons: [ {
            id: 2341341,
            name: 'Джек Лауден',
            enName: 'Jack Lowden',
            photo: 'https://example.com/jack.jpg',
            profession: 'актеры',
            enProfession: 'actor',
            description: 'River Cartwright',
        } ],
    });

    assert.deepEqual(rich.externalRatings, {
        kinopoisk: { value: 7.894, votes: 42572 },
        imdb: { value: 8.3, votes: 144000 },
        russianCritics: { value: 100, votes: 7 },
    });
    assert.deepEqual(rich.cast[0], {
        provider: 'kinopoisk-dev',
        externalId: '2341341',
        name: 'Джек Лауден',
        originalName: 'Jack Lowden',
        photoUrl: 'https://example.com/jack.jpg',
        profession: 'actor',
        role: 'River Cartwright',
        order: 0,
    });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm test:lookup`

Expected: FAIL because `mapKinopoiskRichMetadata` and rich detail fields do not exist.

- [ ] **Step 3: Add validated provider-neutral schemas**

Add bounded schemas in `movie-lookup-types.ts`:

```ts
export const externalRatingSchema = z.object({
    value: z.number().finite().min(0).max(100),
    votes: z.number().int().min(0).max(2_000_000_000).nullish(),
});

export const externalRatingsSchema = z.object({
    kinopoisk: externalRatingSchema.nullish(),
    imdb: externalRatingSchema.nullish(),
    russianCritics: externalRatingSchema.nullish(),
});

export const movieCastMemberSchema = z.object({
    provider: z.literal('kinopoisk-dev'),
    externalId: z.string().min(1).max(100),
    name: z.string().min(1).max(300),
    originalName: z.string().max(300).nullish(),
    photoUrl: nullableHttpUrlSchema,
    profession: z.literal('actor'),
    role: z.string().max(500).nullish(),
    order: z.number().int().min(0).max(999),
});

export const movieLookupDetailsSchema = movieLookupCandidateSchema.extend({
    seasons: seriesMetadataSnapshotSchema,
    externalRatings: externalRatingsSchema.nullish(),
    cast: z.array(movieCastMemberSchema).max(100).default([]),
});
```

Export inferred `ExternalRatings` and `MovieCastMember` types.

- [ ] **Step 4: Map rich fields only in detailed Kinopoisk loads**

Extend `KinopoiskMovie` with `votes` and rich person fields. Export a pure
`mapKinopoiskRichMetadata(movie)` that rejects invalid IDs/URLs/scores, keeps
actors only, deduplicates by person ID, and limits cast to 100. Merge its result
inside `loadKinopoiskCandidate`; do not add cast arrays to search candidates.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm test:lookup && pnpm typecheck`

Expected: PASS.

```bash
git add src/lib/movie-lookup-types.ts src/server/movie-lookup-providers/kinopoisk-dev.ts scripts/movie-lookup.test.ts
git commit -m "feat(metadata): map ratings and cast"
git push origin main
```

---

### Task 2: Additive Database Schema And Rich Metadata Normalization

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260820200000_movie_people_reviews/migration.sql`
- Create: `src/lib/movie-rich-metadata.ts`
- Create: `scripts/movie-rich-metadata.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `normalizeExternalRatings()`, `normalizeCastSnapshot()`, `mergeExternalRatings()`.
- Adds: `Person`, `MoviePersonCredit`, `ReviewSentiment`, external rating columns, and additive review columns.

- [ ] **Step 1: Write failing normalization tests**

Cover valid values, invalid score/vote removal, cast deduplication/order, and
partial-rating merge preservation:

```ts
test('partial rating refresh preserves existing provider values', () => {
    assert.deepEqual(mergeExternalRatings(
        { kinopoisk: { value: 7.8, votes: 100 }, imdb: { value: 8.1, votes: 200 }, russianCritics: null },
        { kinopoisk: { value: 7.9, votes: 110 }, imdb: null, russianCritics: null },
    ), {
        kinopoisk: { value: 7.9, votes: 110 },
        imdb: { value: 8.1, votes: 200 },
        russianCritics: null,
    });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm exec tsx --test scripts/movie-rich-metadata.test.ts`

Expected: FAIL because the normalization module does not exist.

- [ ] **Step 3: Implement pure normalization helpers**

Use the Zod schemas from Task 1. Return stable, deduplicated snapshots and a
field-by-field merge where `null` from a partial provider response never erases
a previous non-null rating.

- [ ] **Step 4: Add Prisma models and migration**

Add these schema concepts with matching SQL:

```prisma
enum ReviewSentiment {
  POSITIVE
  NEUTRAL
  NEGATIVE
}

model Person {
  id                String              @id @default(cuid())
  provider          String
  externalId        String
  name              String
  originalName      String?
  photoUrl          String?
  sex               String?
  growthCm          Int?
  birthDate         DateTime?           @db.Date
  deathDate         DateTime?           @db.Date
  birthPlace        String[]
  professions       String[]
  facts             String[]
  filmography       Json?
  profileUpdatedAt  DateTime?
  credits           MoviePersonCredit[]

  @@unique([provider, externalId])
  @@index([name])
}

model MoviePersonCredit {
  id         String @id @default(cuid())
  movieId    String
  movie      Movie  @relation(fields: [movieId], references: [id], onDelete: Cascade)
  personId   String
  person     Person @relation(fields: [personId], references: [id], onDelete: Cascade)
  profession String
  role       String?
  position   Int

  @@unique([movieId, personId, profession])
  @@index([movieId, position])
  @@index([personId])
}
```

Add nullable `kinopoiskRating`, `kinopoiskVotes`, `imdbRating`, `imdbVotes`,
`russianCriticsPercent`, and `russianCriticsVotes` to `Movie`. Add nullable
`title`, non-null `sentiment @default(NEUTRAL)`, and `updatedAt @updatedAt` to
`Comment`. SQL must create the enum/table/indexes/foreign keys and alter
existing rows without deleting data.

- [ ] **Step 5: Generate Prisma client and run tests**

Run:

```bash
pnpm db:generate
pnpm exec tsx --test scripts/movie-rich-metadata.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Register test script and commit**

Add `test:rich-metadata` and include it in `pnpm test`.

```bash
git add prisma src/lib/movie-rich-metadata.ts scripts/movie-rich-metadata.test.ts package.json
git commit -m "feat(db): add people ratings and reviews schema"
git push origin main
```

---

### Task 3: Persist Ratings And Cast With Movie Metadata

**Files:**
- Create: `src/server/movie-rich-metadata.ts`
- Modify: `src/lib/movie-data.ts`
- Modify: `src/server/movies.ts`
- Modify: `src/components/movies/MovieForm.tsx`
- Modify: `src/routes/movies/new.tsx`
- Modify: `src/routes/movies/$movieId_.edit.tsx`
- Modify: `scripts/movie-form-flow.test.ts`
- Modify: `scripts/movie-rich-metadata.test.ts`

**Interfaces:**
- Produces: `writeMovieRichMetadata(tx, movieId, snapshot)`.
- Extends: `MovieFormFields` with optional `externalRatings` and `cast` snapshots.
- Extends: `MovieDetails` with stored ratings and `cast` containing local `personId` links.

- [ ] **Step 1: Write failing form-flow and write-helper tests**

Assert that candidate selection carries rich snapshots into form defaults,
`MovieForm` submits them only after successful detailed import, and the server
schema accepts them. Add a dependency-injected writer test proving that an
empty cast does not call `deleteMany`, while a valid cast upserts people and
replaces ordered credits.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
pnpm test:movie-form-flow
pnpm test:rich-metadata
```

Expected: FAIL on absent rich metadata fields/writer.

- [ ] **Step 3: Carry rich snapshots through add/edit forms**

Extend `MovieFormFields`, `candidateToFormDefaults`, `movieToFormDefaults`, and
`mergeLookupDefaults`. In `MovieForm.handleSubmit`, include:

```ts
externalRatings: metadataImportSucceeded ? defaults?.externalRatings : undefined,
cast: metadataImportSucceeded ? defaults?.cast : undefined,
```

An ordinary edit without metadata refresh omits both fields, preserving stored
snapshots.

- [ ] **Step 4: Implement transactional persistence**

Validate the optional fields in `movieFieldsSchema`. Inside the existing create
and update transactions call:

```ts
await writeMovieRichMetadata(tx, movieId, {
    importSucceeded: data.metadataImportSucceeded === true,
    externalRatings: data.externalRatings,
    cast: data.cast,
});
```

The helper must:

- no-op unless `importSucceeded` is true;
- merge non-null rating values into existing movie columns;
- upsert people by `(provider, externalId)` with compact identity fields;
- replace credits only for a valid non-empty cast snapshot;
- retain previous credits on empty/failed data.

- [ ] **Step 5: Return stored cast and ratings from `getMovie`**

Include ordered credits and people. Map remote image URLs unchanged and expose:

```ts
type MovieCastPerson = MovieCastMember & { personId: string };
```

Keep `starring` for legacy fallback.

- [ ] **Step 6: Run tests and commit**

Run:

```bash
pnpm test:movie-form-flow
pnpm test:rich-metadata
pnpm test:series-metadata
pnpm typecheck
```

Expected: PASS.

```bash
git add src/lib/movie-data.ts src/server/movie-rich-metadata.ts src/server/movies.ts src/components/movies/MovieForm.tsx src/routes/movies/new.tsx 'src/routes/movies/$movieId_.edit.tsx' scripts/movie-form-flow.test.ts scripts/movie-rich-metadata.test.ts
git commit -m "feat(movies): persist ratings and cast metadata"
git push origin main
```

---

### Task 4: Cached Person Profiles And Full Filmography

**Files:**
- Create: `src/lib/person-data.ts`
- Create: `src/lib/person-cache.ts`
- Create: `src/server/people.ts`
- Modify: `src/server/movie-lookup-providers/kinopoisk-dev.ts`
- Create: `scripts/people.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `PersonProfile`, `PersonFilmographyEntry`, `resolvePersonProfile()`.
- Server API: `getPerson({ data: { personId } })` using the local `Person.id`.

- [ ] **Step 1: Write failing cache and mapping tests**

Test fresh-cache reuse, stale refresh, stale fallback after provider failure,
filmography deduplication, acting-credit filtering, and local movie matching:

```ts
test('stale cache remains available when refresh fails', async () => {
    const result = await resolvePersonSnapshot({
        cached: cachedPerson,
        now: new Date('2026-08-20T12:00:00Z'),
        maxAgeMs: 7 * 24 * 60 * 60 * 1000,
        loadFresh: async () => null,
    });
    assert.equal(result.source, 'stale-cache');
    assert.deepEqual(result.profile, cachedPerson.profile);
});
```

- [ ] **Step 2: Run test and verify RED**

Run: `pnpm exec tsx --test scripts/people.test.ts`

Expected: FAIL because person cache modules do not exist.

- [ ] **Step 3: Add validated person DTOs and pure cache resolution**

In `person-data.ts`, bound names to 300 chars, facts to 100 items, filmography
to 2,000 entries, and URLs to HTTP(S). Define one entry with external movie ID,
title/original title, year, poster, type, rating, role, and optional local movie
ID. In `person-cache.ts`, implement TTL selection without DB imports.

- [ ] **Step 4: Implement Kinopoisk person loading**

Add a server-only loader for `/v1.4/person/{id}`. Filter `person.movies` to
`enProfession === 'actor'`, deduplicate IDs, then enrich movie summaries through
`/v1.4/movie` in chunks of at most 100 IDs. If enrichment fails for a chunk,
retain title/role from the person response.

- [ ] **Step 5: Implement database-backed `getPerson`**

Load the local person row, use cache when younger than seven days, otherwise
refresh and update profile fields plus validated JSON filmography. Match local
movies by `metadataExternalId` and return their local IDs. If refresh fails,
return stale cache; if no cache exists, return `{ ok: false, error }`.

- [ ] **Step 6: Run tests and commit**

Add `test:people` to `package.json` and the full test chain.

Run: `pnpm test:people && pnpm typecheck`

Expected: PASS.

```bash
git add src/lib/person-data.ts src/lib/person-cache.ts src/server/people.ts src/server/movie-lookup-providers/kinopoisk-dev.ts scripts/people.test.ts package.json
git commit -m "feat(people): cache profiles and filmography"
git push origin main
```

---

### Task 5: Actor Page And Rich Movie Detail Sections

**Files:**
- Create: `src/components/movies/MovieRatings.tsx`
- Create: `src/components/movies/MovieCast.tsx`
- Create: `src/components/people/PersonFilmography.tsx`
- Create: `src/routes/people/$personId.tsx`
- Modify: `src/routes/movies/$movieId.tsx`
- Create: `scripts/movie-detail-rich.test.ts`
- Modify: `package.json`
- Modify generated: `src/routeTree.gen.ts`

**Interfaces:**
- Consumes: stored `MovieDetails.externalRatings`, `MovieDetails.cast`, and `getPerson()`.
- Produces: public `/people/$personId` route and responsive ratings/cast/person UI.

- [ ] **Step 1: Write failing route/component contract tests**

Assert that `DetailsTable` is removed, `Описание` renders only
`movie.description`, external rating labels render conditionally, cast links use
`/people/$personId`, and external/local filmography links use the correct target.

- [ ] **Step 2: Run focused test and verify RED**

Run: `pnpm exec tsx --test scripts/movie-detail-rich.test.ts`

Expected: FAIL because the new components and route do not exist.

- [ ] **Step 3: Build the compact ratings band**

Render only available tiles for `Кинопоиск`, `IMDb`, `Критики`, and `AY Movies`.
Format large vote counts with `Intl.NumberFormat('ru-RU')`. Keep the existing
five-star authenticated action inside the AY Movies tile and remove the old
standalone rating rows/cards to avoid duplication.

- [ ] **Step 4: Build the responsive cast grid**

Use stable portrait aspect ratios, two columns on narrow mobile widths, and
four-plus columns at wider breakpoints. Show name and role; link each item to
the person route. Initially show eight entries and toggle the complete imported
cast with `Все`/`Свернуть`. Render the old comma-separated `starring` text only
when `movie.cast` is empty.

- [ ] **Step 5: Build the person page**

Use `<PageTitle>` with a header back button. Render the compact profile summary
and a responsive filmography grid. Local entries use TanStack `<Link>` to
`/movies/$movieId`; external entries use `https://www.kinopoisk.ru/film/{id}/`
with `target="_blank"` and `rel="noreferrer"`. Missing portraits/posters render
fixed-size placeholders.

- [ ] **Step 6: Compose the movie/series detail page**

Remove `DetailsTable` and the repeated top rating. Place trailers, description,
`MovieRatings`, `MovieCast`, watch links, and reviews in the agreed order. Keep
`SeriesSeasons` unchanged in its second tab.

- [ ] **Step 7: Generate routes, run tests, and commit**

Register `test:movie-detail-rich` in `package.json`; run build once to regenerate
the route tree.

```bash
pnpm test:movie-detail-rich
pnpm test:movie-navigation-detail
pnpm build
pnpm typecheck
```

Expected: PASS.

```bash
git add src/components/movies/MovieRatings.tsx src/components/movies/MovieCast.tsx src/components/people/PersonFilmography.tsx 'src/routes/people/$personId.tsx' 'src/routes/movies/$movieId.tsx' src/routeTree.gen.ts scripts/movie-detail-rich.test.ts package.json
git commit -m "feat(ui): add ratings cast and actor pages"
git push origin main
```

---

### Task 6: Convert Comments Into Avatar-Based Reviews

**Files:**
- Create: `src/server/reviews.ts`
- Delete: `src/server/comments.ts`
- Create: `src/components/movies/ReviewsSection.tsx`
- Delete: `src/components/movies/CommentsSection.tsx`
- Modify: `src/routes/movies/$movieId.tsx`
- Modify: `src/server/notifications.ts`
- Modify: `src/server/profile.ts`
- Modify: `src/server/dashboard.ts`
- Modify: `src/routes/profile.tsx`
- Modify: `src/routes/dashboard.$userId.tsx`
- Modify: `src/routes/dashboard.index.tsx`
- Modify: `src/components/ProfileDialog.tsx`
- Modify: `src/components/movies/MovieCard.tsx`
- Create: `scripts/reviews.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `MovieReview`, `getReviews`, `addReview`, `updateReview`, `deleteReview`.
- Keeps: physical Prisma `Comment` model/table and existing counts for migration safety.

- [ ] **Step 1: Write failing review API and copy contract tests**

Cover avatar mapping, old rows without titles, sentiment validation, owner edit,
administrator edit/delete, unauthorized rejection, and visible copy replacement.
Use dependency-injected authorization helpers for deterministic unit tests:

```ts
test('review can be managed by its author or an administrator', () => {
    assert.equal(canManageReview({ userId: 'u1', role: 'USER' }, 'u1'), true);
    assert.equal(canManageReview({ userId: 'admin', role: 'ADMIN' }, 'u1'), true);
    assert.equal(canManageReview({ userId: 'u2', role: 'USER' }, 'u1'), false);
});
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `pnpm exec tsx --test scripts/reviews.test.ts`

Expected: FAIL because review modules do not exist and old comment copy remains.

- [ ] **Step 3: Implement review server functions**

Return author ID/name/avatar, title, sentiment, text, timestamps, and management
permissions. Validate title at 120 chars and text at 5,000 chars. Preserve
multiple historical reviews per user. Editing updates title/sentiment/text;
deletion and editing allow the author or an administrator.

- [ ] **Step 4: Build `ReviewsSection`**

Replace the comment form with optional title input, three compact sentiment
controls, text area, and submit action. Cards show the author avatar/name, date,
edited marker, sentiment accent, title when present, and full review text.
Support inline editing and deletion. Clicking the author opens the existing
profile dialog through the established profile event/pattern.

- [ ] **Step 5: Rename user-facing comment copy**

Change all profile/dashboard/card labels and accessibility text from comments
to reviews while retaining internal DB `_count.comments` values. Rename
notification generation to `createReviewNotifications`, use type `REVIEW`, and
send title `${author} оставил рецензию`; follower/friend audience rules remain
unchanged.

- [ ] **Step 6: Run tests and commit**

Register `test:reviews` and include it in `pnpm test`.

```bash
pnpm test:reviews
pnpm test:movie-detail-rich
pnpm typecheck
pnpm build
```

Expected: PASS.

```bash
git add src/server/reviews.ts src/components/movies/ReviewsSection.tsx 'src/routes/movies/$movieId.tsx' src/server/notifications.ts src/server/profile.ts src/server/dashboard.ts src/routes/profile.tsx 'src/routes/dashboard.$userId.tsx' src/routes/dashboard.index.tsx src/components/ProfileDialog.tsx src/components/movies/MovieCard.tsx scripts/reviews.test.ts package.json
git rm src/server/comments.ts src/components/movies/CommentsSection.tsx
git commit -m "feat(reviews): replace comments with user reviews"
git push origin main
```

---

### Task 7: Documentation, Full Verification, And Production Deployment

**Files:**
- Modify: `AGENTS.md`
- Modify: `src/routes/AGENTS.md`
- Modify: `src/components/AGENTS.md`
- Modify: `src/server/AGENTS.md`

**Interfaces:**
- Documents: provider cache, rich snapshot safety, actor routes, review naming, and deployment checks.

- [ ] **Step 1: Update handoff documentation**

Document the new models, seven-day person cache, fallback behavior, route paths,
review authorization, and focused test commands. Keep env variable names only;
do not include token values.

- [ ] **Step 2: Run schema and full application verification**

```bash
pnpm db:generate
pnpm test
pnpm typecheck
pnpm build
git diff --check
git status --short
```

Expected: every command succeeds and only intended documentation changes remain.

- [ ] **Step 3: Commit and push documentation**

```bash
git add AGENTS.md src/routes/AGENTS.md src/components/AGENTS.md src/server/AGENTS.md
git commit -m "docs(movies): document people ratings and reviews"
git push origin main
```

- [ ] **Step 4: Deploy to the Timeweb VDS**

Use the established deployment directory and Compose service:

```bash
ssh deploy@72.56.8.147 '
  set -eu
  git -C /opt/ayurash/apps/ay-movies pull --ff-only origin main
  cd /opt/ayurash
  docker compose build ay-movies
  docker compose up -d ay-movies
  docker compose ps ay-movies
'
```

The container startup must apply `20260820200000_movie_people_reviews` through
`prisma migrate deploy` before serving traffic.

- [ ] **Step 5: Verify production behavior without exposing secrets**

Check:

```bash
curl -fsS -o /dev/null -w 'HTTP %{http_code}\n' https://movies.ayurash.ru
ssh deploy@72.56.8.147 'cd /opt/ayurash && docker compose exec -T ay-movies pnpm exec prisma migrate status'
```

Then verify at desktop and mobile widths:

- movie description contains no repeated details table;
- ratings and cast render after refreshing a Kinopoisk-backed movie;
- an actor page opens, caches, and links local/external filmography correctly;
- old comments appear as neutral avatar-based reviews;
- review add/edit/delete and administrator management work;
- series episode tabs and metadata refresh still work.
