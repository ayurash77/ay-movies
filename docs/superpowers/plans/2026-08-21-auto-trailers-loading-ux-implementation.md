# Automatic Trailers And Loading Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import structured trailers and teasers with movie metadata, preserve manual links, render lazy video cards, and make route and image loading visible on slow connections.

**Architecture:** Kinopoisk Unofficial video metadata is normalized into a provider-neutral snapshot and persisted in a new `MovieVideo` relation during the existing add/refresh transaction. Detail pages merge that local snapshot with manual URLs and create a player only after selection. TanStack Router pending state drives a header progress line and route-shaped pending components, while a shadcn-style `Skeleton` underpins stable progressive images.

**Tech Stack:** TanStack Start/Router, React 19, TypeScript, Prisma/PostgreSQL, Zod, Tailwind CSS 4, Radix Dialog, shadcn component patterns, Node test runner, Testing Library/happy-dom.

**Spec:** `docs/superpowers/specs/2026-08-21-auto-trailers-loading-ux-design.md`

## Global Constraints

- Automatic videos supplement `Movie.trailerUrls`; they never replace or rewrite manual links.
- Detail routes read video metadata only from PostgreSQL and never call a provider.
- Only trailer/teaser entries from allowlisted HTTPS player URLs are stored; raw provider payloads and tokens stay server-only.
- An empty or failed refresh preserves the last valid automatic video snapshot.
- A player iframe is created only after the user selects a video and is removed when its dialog closes.
- Pending UI appears after `120 ms`, remains visible for at least `250 ms`, preserves layout dimensions, and respects reduced motion.
- Use the local shadcn-compatible `Skeleton`; do not add a second animation placeholder implementation.
- Keep all image and fixed-format media dimensions stable on mobile and desktop.
- Prisma schema changes require a migration; production applies it with `prisma migrate deploy`.

## File Structure

- `src/lib/movie-videos.ts` owns video schemas, normalization, source merging, labels, and safe embed URL conversion.
- `src/server/movie-lookup-providers/kinopoisk-unofficial.ts` maps the provider video endpoint into the shared DTO.
- `src/server/movie-lookup.ts` enriches details selected from either Kinopoisk provider with the automatic video snapshot.
- `src/server/movie-rich-metadata.ts` persists a non-empty automatic snapshot inside the existing transaction.
- `src/components/movies/MovieTrailers.tsx` owns the horizontal preview, full list, and lazy player dialog.
- `src/components/ui/dialog.tsx` and `src/components/ui/skeleton.tsx` provide local shadcn-style primitives consistent with existing Radix/Tailwind components.
- `src/components/ui/progressive-image.tsx` owns image load/error state and overlays the shared skeleton.
- `src/components/loading/NavigationProgress.tsx` and `src/components/loading/RouteSkeletons.tsx` own route loading feedback.
- Existing add/edit/detail routes only compose these boundaries and pass DTOs through.

---

### Task 1: Provider-Neutral Video Metadata And Kinopoisk Import

**Files:**
- Create: `src/lib/movie-videos.ts`
- Modify: `src/lib/movie-lookup-types.ts`
- Modify: `src/lib/movie-lookup-details.ts`
- Modify: `src/server/movie-lookup-providers/kinopoisk-unofficial.ts`
- Modify: `src/server/movie-lookup.ts`
- Create: `scripts/movie-videos.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `MovieVideoMetadata`, `movieVideoMetadataSchema`, `movieVideoSnapshotSchema`, `normalizeMovieVideoSnapshot(value)`, `mapKinopoiskUnofficialVideos(items)`, and `loadKinopoiskUnofficialVideos(externalId)`.
- Extends: `MovieLookupDetails.videos: MovieVideoMetadata[]` and `movieLookupFormMetadata(...).videos`.
- Provider entry shape: `{ url?: string | null; name?: string | null; site?: string | null }`.

- [ ] **Step 1: Write failing video schema and provider mapping tests**

Create `scripts/movie-videos.test.ts` with focused assertions:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    movieVideoSnapshotSchema,
    normalizeMovieVideoSnapshot,
} from '../src/lib/movie-videos';
import { mapKinopoiskUnofficialVideos } from '../src/server/movie-lookup-providers/kinopoisk-unofficial';

test('maps only supported trailers and teasers in stable order', () => {
    const videos = mapKinopoiskUnofficialVideos([
        { name: 'О съёмках', site: 'KINOPOISK_WIDGET', url: 'https://widgets.kinopoisk.ru/discovery/trailer/1' },
        { name: 'Тизер №1', site: 'KINOPOISK_WIDGET', url: 'https://widgets.kinopoisk.ru/discovery/trailer/2' },
        { name: 'Official Trailer', site: 'YOUTUBE', url: 'https://www.youtube.com/watch?v=abc123def45' },
        { name: 'Trailer duplicate', site: 'YOUTUBE', url: 'https://www.youtube.com/watch?v=abc123def45' },
        { name: 'Интервью', site: 'UNKNOWN', url: 'https://example.com/interview' },
    ]);

    assert.deepEqual(videos.map(({ title, kind, position }) => ({ title, kind, position })), [
        { title: 'Official Trailer', kind: 'TRAILER', position: 0 },
        { title: 'Тизер №1', kind: 'TEASER', position: 1 },
    ]);
});

test('normalizer rejects non-https, unsupported hosts, duplicates, and overlong values', () => {
    assert.deepEqual(normalizeMovieVideoSnapshot([
        { provider: 'kinopoisk-unofficial', site: 'YOUTUBE', title: 'Трейлер', kind: 'TRAILER', url: 'http://youtube.com/watch?v=abc123def45', position: 0 },
        { provider: 'kinopoisk-unofficial', site: 'UNKNOWN', title: 'Трейлер', kind: 'TRAILER', url: 'https://example.com/video', position: 1 },
    ]), []);
    assert.equal(movieVideoSnapshotSchema.safeParse(Array.from({ length: 31 }, (_, position) => ({
        provider: 'kinopoisk-unofficial',
        site: 'YOUTUBE',
        title: `Трейлер ${position}`,
        kind: 'TRAILER',
        url: `https://www.youtube.com/watch?v=${String(position).padStart(11, 'a')}`,
        position,
    }))).success, false);
});
```

Extend `scripts/movie-lookup.test.ts` to prove `movieLookupDetailsSchema` defaults missing videos to `[]`, `movieLookupFormMetadata` carries videos after successful import, and retains current videos after a failed/partial series import.

- [ ] **Step 2: Run the focused tests and verify the new imports fail**

Run:

```bash
pnpm tsx --test scripts/movie-videos.test.ts scripts/movie-lookup.test.ts
```

Expected: FAIL because `src/lib/movie-videos.ts`, video schemas, and provider mapper do not exist.

- [ ] **Step 3: Add the bounded provider-neutral schemas and normalization**

Create `src/lib/movie-videos.ts` around these public contracts:

```ts
export const MOVIE_VIDEO_LIMITS = {
    maxItems: 30,
    maxTitleLength: 300,
    maxSiteLength: 64,
    maxUrlLength: 2048,
} as const;

export const movieVideoKindSchema = z.enum([ 'TRAILER', 'TEASER' ]);

export const movieVideoMetadataSchema = z.object({
    provider: z.literal('kinopoisk-unofficial'),
    site: z.string().trim().min(1).max(MOVIE_VIDEO_LIMITS.maxSiteLength),
    title: z.string().trim().min(1).max(MOVIE_VIDEO_LIMITS.maxTitleLength),
    kind: movieVideoKindSchema,
    url: z.string().trim().max(MOVIE_VIDEO_LIMITS.maxUrlLength).url(),
    position: z.number().int().min(0).max(999),
});

export const movieVideoSnapshotSchema = z.array(movieVideoMetadataSchema)
    .max(MOVIE_VIDEO_LIMITS.maxItems);

export type MovieVideoMetadata = z.infer<typeof movieVideoMetadataSchema>;
```

Implement `normalizeMovieVideoSnapshot(value)` so it:

- parses each entry independently;
- requires HTTPS;
- accepts `youtube.com`, `www.youtube.com`, `youtu.be`, `vimeo.com`, `www.vimeo.com`, and `widgets.kinopoisk.ru` with `/discovery/trailer/` paths;
- canonicalizes YouTube watch/short URLs to one comparison key;
- deduplicates by canonical URL;
- sorts `TRAILER` before `TEASER`, then by input position;
- reassigns contiguous positions and limits the result to 30.

- [ ] **Step 4: Map and load Kinopoisk Unofficial videos**

Add provider response types and the pure mapper:

```ts
export type KinopoiskUnofficialVideo = {
    url?: string | null;
    name?: string | null;
    site?: string | null;
};

type VideoResponse = { items?: KinopoiskUnofficialVideo[] | null };

export function mapKinopoiskUnofficialVideos(
    items: KinopoiskUnofficialVideo[],
): MovieVideoMetadata[];

export async function loadKinopoiskUnofficialVideos(
    externalId: string,
): Promise<MovieVideoMetadata[]>;
```

Classify Russian/English names with `/трейлер|trailer/i` and `/тизер|teaser/i`; exclude entries matching neither. Call `/api/v2.2/films/${id}/videos` through the existing `getJson` and return `[]` after invalid IDs, missing token, timeout, or non-OK response.

Load videos alongside movie/staff/seasons in `loadKinopoiskUnofficialCandidate` and include `videos` in `movieLookupDetailsSchema.parse(...)`.

- [ ] **Step 5: Enrich details selected from either Kinopoisk provider**

Extend `movieLookupDetailsSchema`:

```ts
export const movieLookupDetailsSchema = movieLookupCandidateSchema.safeExtend({
    seasons: seriesMetadataSnapshotSchema,
    externalRatings: externalRatingsSchema.nullish(),
    cast: z.array(movieCastMemberSchema).max(100).default([]),
    videos: movieVideoSnapshotSchema.default([]),
});
```

After `resolveMovieLookupDetails` returns a usable result in `loadMovieLookupDetails`, retain its videos when non-empty; otherwise call `loadKinopoiskUnofficialVideos(data.externalId)` and parse the merged object again. Do not call this endpoint for Wikidata IDs.

Extend `FormMetadataSnapshot` and `movieLookupFormMetadata` with `videos?: MovieVideoMetadata[]`, preserving `current.videos` when import is not usable.

- [ ] **Step 6: Run focused tests and commit**

Add `test:movie-videos` to `package.json` and include it in `test`. Run:

```bash
pnpm test:movie-videos
pnpm test:lookup
pnpm typecheck
git add package.json scripts/movie-videos.test.ts scripts/movie-lookup.test.ts src/lib/movie-videos.ts src/lib/movie-lookup-types.ts src/lib/movie-lookup-details.ts src/server/movie-lookup.ts src/server/movie-lookup-providers/kinopoisk-unofficial.ts
git commit -m "feat(metadata): import trailers and teasers"
git push origin main
```

Expected: all focused tests and typecheck pass.

---

### Task 2: Persist Automatic Video Snapshots Through Add And Refresh

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260821130000_movie_videos/migration.sql`
- Modify: `src/lib/movie-data.ts`
- Modify: `src/server/movie-rich-metadata.ts`
- Modify: `src/server/movies.ts`
- Modify: `src/components/movies/MovieForm.tsx`
- Modify: `src/routes/movies/new.tsx`
- Modify: `src/routes/movies/$movieId_.edit.tsx`
- Modify: `scripts/movie-rich-metadata.test.ts`
- Modify: `scripts/movie-form-flow.test.ts`

**Interfaces:**
- Consumes: `MovieVideoMetadata`, `normalizeMovieVideoSnapshot`, and `MovieLookupDetails.videos` from Task 1.
- Produces: `Movie.videos`, Prisma model `MovieVideo`, enum `MovieVideoKind`, `MovieDetails.videos`, and `MovieFormFields.videos`.
- Extends: `MovieRichMetadataSnapshot.videos?: MovieVideoMetadata[]` and `MovieRichMetadataWriter.movieVideo`.

- [ ] **Step 1: Write failing persistence tests**

Extend the fake writer in `scripts/movie-rich-metadata.test.ts` with video call recording, then add:

```ts
// Add to createWriter().calls.
videoDeletes: [] as Array<Record<string, unknown>>,
videoCreates: [] as Array<{ data: Array<Record<string, unknown>> }>,

// Add to createWriter().tx.
movieVideo: {
    deleteMany: async (args) => {
        calls.events.push('video.deleteMany');
        calls.videoDeletes.push(args);
        return { count: 0 };
    },
    createMany: async (args) => {
        calls.events.push('video.createMany');
        calls.videoCreates.push(args);
        return { count: args.data.length };
    },
},

const validVideos = [ {
    provider: 'kinopoisk-unofficial' as const,
    site: 'YOUTUBE',
    title: 'Трейлер',
    kind: 'TRAILER' as const,
    url: 'https://www.youtube.com/watch?v=abc123def45',
    position: 0,
} ];

test('rich metadata writer atomically replaces a non-empty video snapshot', async () => {
    const { calls, tx } = createWriter();
    await writeMovieRichMetadata(tx, 'movie-1', {
        importSucceeded: true,
        videos: validVideos,
    });

    assert.deepEqual(calls.videoDeletes, [ { where: { movieId: 'movie-1' } } ]);
    assert.deepEqual(calls.videoCreates[0].data[0], {
        movieId: 'movie-1',
        provider: 'kinopoisk-unofficial',
        site: 'YOUTUBE',
        title: 'Трейлер',
        kind: 'TRAILER',
        url: 'https://www.youtube.com/watch?v=abc123def45',
        position: 0,
    });
});

test('empty or failed video imports preserve the previous snapshot', async () => {
    for (const snapshot of [
        { importSucceeded: false, videos: validVideos },
        { importSucceeded: true, videos: [] },
    ]) {
        const { calls, tx } = createWriter();
        await writeMovieRichMetadata(tx, 'movie-1', snapshot);
        assert.deepEqual(calls.videoDeletes, []);
        assert.deepEqual(calls.videoCreates, []);
    }
});
```

Extend `scripts/movie-form-flow.test.ts` source contracts to require `videos` in add/edit defaults, metadata merge, `MovieForm` submit payload, and both `writeMovieRichMetadata` calls.

- [ ] **Step 2: Run tests and verify persistence expectations fail**

Run:

```bash
pnpm test:rich-metadata
pnpm test:movie-form-flow
```

Expected: FAIL because Prisma and the rich metadata writer do not expose automatic videos.

- [ ] **Step 3: Add the additive Prisma migration**

Update `Movie` and add:

```prisma
model MovieVideo {
  id       String         @id @default(cuid())
  movieId  String
  movie    Movie          @relation(fields: [movieId], references: [id], onDelete: Cascade)
  provider String
  site     String
  title    String
  kind     MovieVideoKind
  url      String         @db.VarChar(2048)
  position Int

  @@unique([movieId, url])
  @@index([movieId, position])
}

enum MovieVideoKind {
  TRAILER
  TEASER
}
```

Add `videos MovieVideo[]` to `Movie`. Generate the migration with:

```bash
pnpm db:migrate:dev --name movie_videos
pnpm db:generate
```

Inspect the SQL to confirm it only creates the enum/table/indexes/foreign key and does not alter `trailerUrls` or existing rows.

- [ ] **Step 4: Persist non-empty automatic snapshots**

Extend `MovieRichMetadataWriter`:

```ts
movieVideo: {
    deleteMany(args: { where: { movieId: string } }): PromiseLike<unknown>;
    createMany(args: { data: Array<{
        movieId: string;
        provider: string;
        site: string;
        title: string;
        kind: 'TRAILER' | 'TEASER';
        url: string;
        position: number;
    }> }): PromiseLike<unknown>;
};
```

In `writeMovieRichMetadata`, normalize `snapshot.videos`. When non-empty, delete the movie's previous automatic rows and create the normalized rows before cast handling. Do not return early after empty cast until video persistence has run. Empty or invalid video arrays perform no video writes.

- [ ] **Step 5: Carry videos through form and CRUD DTOs**

Add `videos?: MovieVideoMetadata[]` to `MovieFormFields` and `videos: MovieVideoMetadata[]` to `MovieDetails`.

In `getMovie`, include `videos: { orderBy: { position: 'asc' } }` and map only rows accepted by `movieVideoMetadataSchema`. Add `videos: movie.videos` to edit defaults and preserve them through `movieLookupFormMetadata`.

Add `videos: movieVideoSnapshotSchema.optional()` to `movieFieldsSchema`. Submit videos only with a successful metadata import:

```ts
videos: metadataImportSucceeded ? defaults?.videos : undefined,
```

Pass `videos` into both `writeMovieRichMetadata` calls. `toMovieData` continues to own only manual `trailerUrls`; it must not copy automatic URLs there.

- [ ] **Step 6: Run focused tests, typecheck, migration status, and commit**

Run:

```bash
pnpm test:rich-metadata
pnpm test:movie-form-flow
pnpm typecheck
pnpm prisma migrate status
git add prisma/schema.prisma prisma/migrations/20260821130000_movie_videos src/lib/movie-data.ts src/server/movie-rich-metadata.ts src/server/movies.ts src/components/movies/MovieForm.tsx src/routes/movies/new.tsx 'src/routes/movies/$movieId_.edit.tsx' scripts/movie-rich-metadata.test.ts scripts/movie-form-flow.test.ts
git commit -m "feat(movies): persist automatic video metadata"
git push origin main
```

Expected: tests and typecheck pass; local migration history is up to date.

---

### Task 3: Lazy Trailer Cards And Player Dialog

**Files:**
- Create: `src/components/ui/dialog.tsx`
- Create: `src/components/movies/MovieTrailers.tsx`
- Modify: `src/lib/movie-videos.ts`
- Modify: `src/routes/movies/$movieId.tsx`
- Create: `scripts/movie-trailers.test.tsx`
- Modify: `package.json`

**Interfaces:**
- Consumes: `MovieDetails.videos`, `MovieDetails.trailerUrls`, and `MovieDetails.posterUrl`.
- Produces: `mergeMovieVideoSources(automatic, manual)`, `movieVideoEmbedUrl(url)`, `MovieTrailers`.
- `MovieTrailers` props: `{ title: string; posterUrl: string | null; automaticVideos: MovieVideoMetadata[]; manualUrls: string[] }`.

- [ ] **Step 1: Write failing merge, embed, and interaction tests**

Add pure tests to `scripts/movie-videos.test.ts`:

```ts
test('automatic videos precede deduplicated manual links', () => {
    const merged = mergeMovieVideoSources(automatic, [
        automatic[0].url,
        'https://vimeo.com/123456',
    ]);
    assert.deepEqual(merged.map((video) => [ video.origin, video.title ]), [
        [ 'automatic', 'Официальный трейлер' ],
        [ 'manual', 'Трейлер 1' ],
    ]);
});

test('embed conversion only accepts supported player URLs', () => {
    assert.equal(movieVideoEmbedUrl('https://youtu.be/abc123def45'), 'https://www.youtube.com/embed/abc123def45');
    assert.equal(movieVideoEmbedUrl('https://widgets.kinopoisk.ru/discovery/trailer/42'), 'https://widgets.kinopoisk.ru/discovery/trailer/42');
    assert.equal(movieVideoEmbedUrl('https://example.com/video'), null);
});
```

Create `scripts/movie-trailers.test.tsx` with happy-dom and Testing Library. Render `MovieTrailers` with six entries and assert:

- heading `Трейлеры и тизеры` and `Все` exist;
- no iframe exists before a card click;
- clicking the first card opens a dialog with an accessible title and one iframe;
- closing the dialog removes the iframe;
- clicking `Все` reveals entries beyond the compact preview;
- an unsupported manual URL renders an external link instead of an iframe.

- [ ] **Step 2: Run tests and verify the component is absent**

Run:

```bash
pnpm tsx --test scripts/movie-videos.test.ts scripts/movie-trailers.test.tsx
```

Expected: FAIL because merge/embed helpers, Dialog, and `MovieTrailers` do not exist.

- [ ] **Step 3: Add the local shadcn-style Dialog primitive**

Create `src/components/ui/dialog.tsx` using the installed `@radix-ui/react-dialog`, matching the project's existing `Sheet` animation, semantic colors, compact radius, and shadows. Export:

```ts
export {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
};
```

`DialogContent` always contains a close control; `MovieTrailers` always supplies `DialogTitle`. Do not add another overlay dependency.

- [ ] **Step 4: Implement merging and safe embedding**

In `src/lib/movie-videos.ts`, export:

```ts
export type DisplayMovieVideo = MovieVideoMetadata & {
    origin: 'automatic' | 'manual';
    sourceLabel: string;
};

export function mergeMovieVideoSources(
    automatic: MovieVideoMetadata[],
    manualUrls: string[],
): DisplayMovieVideo[];

export function movieVideoEmbedUrl(url: string): string | null;
```

Automatic entries are normalized first. Manual URLs are validated, compared with the same canonical key, named `Трейлер 1`, `Трейлер 2`, and appended. Generate labels from known sites or a sanitized hostname. The embed helper returns only YouTube embed, Vimeo player, or the allowlisted Kinopoisk widget URL.

- [ ] **Step 5: Implement the compact preview and lazy player**

Create `MovieTrailers` with these state boundaries:

```ts
const [ selected, setSelected ] = useState<DisplayMovieVideo | null>(null);
const [ showAll, setShowAll ] = useState(false);
const videos = useMemo(
    () => mergeMovieVideoSources(automaticVideos, manualUrls),
    [ automaticVideos, manualUrls ],
);
```

Render at most four items in the compact horizontal list and expose `Все` only when more exist. Cards use a stable `aspect-video`, movie poster fallback, gradient scrim for text readability, and a centered lucide `Play`. The list uses horizontal overflow on mobile and a responsive grid in the full-list dialog.

Open the player dialog for supported embeds. For unsupported manual URLs, render an external anchor with `target="_blank"` and `rel="noreferrer"`. Set iframe `src` only while `selected` is non-null, include the video title, `allowFullScreen`, and the existing media permissions.

- [ ] **Step 6: Replace the eager inline trailer section**

Remove `trailerEmbedUrl` and `TrailerSection` from `src/routes/movies/$movieId.tsx`. Import and render:

```tsx
<MovieTrailers
    title={movie.title}
    posterUrl={movie.posterUrl}
    automaticVideos={movie.videos}
    manualUrls={movie.trailerUrls}
/>
```

Keep it first in `AboutSection` and retain the existing ordering contract.

- [ ] **Step 7: Run UI tests, typecheck, and commit**

Add `test:movie-trailers` and include it in `test`. Run:

```bash
pnpm test:movie-videos
pnpm test:movie-trailers
pnpm test:movie-detail-rich
pnpm typecheck
git add package.json scripts/movie-videos.test.ts scripts/movie-trailers.test.tsx src/lib/movie-videos.ts src/components/ui/dialog.tsx src/components/movies/MovieTrailers.tsx 'src/routes/movies/$movieId.tsx'
git commit -m "feat(ui): add lazy trailer gallery"
git push origin main
```

Expected: no iframe exists before selection; focused tests and typecheck pass.

---

### Task 4: shadcn Skeleton And Progressive Images

**Files:**
- Create: `src/components/ui/skeleton.tsx`
- Create: `src/components/ui/progressive-image.tsx`
- Modify: `src/components/movies/MoviePoster.tsx`
- Modify: `src/components/movies/MovieCast.tsx`
- Modify: `src/routes/people/$personId.tsx`
- Modify: `src/components/movies/SeriesSeasons.tsx`
- Modify: `src/components/movies/MovieTrailers.tsx`
- Create: `scripts/loading-ui.test.tsx`
- Modify: `package.json`

**Interfaces:**
- Produces: shadcn-style `Skeleton` and `ProgressiveImage`.
- `ProgressiveImage` props extend `React.ImgHTMLAttributes<HTMLImageElement>` with `{ wrapperClassName?: string; fallback: ReactNode }`.
- Consumes: stable dimensions supplied by movie poster, cast, person, episode, and trailer owners.

- [ ] **Step 1: Write failing progressive image tests**

Create `scripts/loading-ui.test.tsx` with happy-dom and Testing Library:

```ts
test('progressive image shows skeleton, fades in on load, and removes skeleton', () => {
    const view = render(createElement(ProgressiveImage, {
        src: 'https://example.com/poster.jpg',
        alt: 'Постер',
        fallback: createElement('span', null, 'Нет изображения'),
    }));
    const image = view.getByRole('img', { name: 'Постер' });
    assert.ok(view.container.querySelector('[data-slot="skeleton"]'));
    fireEvent.load(image);
    assert.equal(view.container.querySelector('[data-slot="skeleton"]'), null);
    assert.match(image.className, /opacity-100/);
});

test('progressive image replaces a failed request with semantic fallback', () => {
    const view = render(createElement(ProgressiveImage, {
        src: 'https://example.com/missing.jpg',
        alt: 'Портрет',
        fallback: createElement('span', null, 'Нет портрета'),
    }));
    fireEvent.error(view.getByRole('img', { name: 'Портрет' }));
    assert.equal(view.queryByRole('img'), null);
    assert.match(view.container.textContent ?? '', /Нет портрета/);
});
```

Add source contract assertions that `MoviePoster`, `MovieCast`, person summary, episode stills, and trailer cards use `ProgressiveImage` or `Skeleton` and retain explicit aspect/size classes.

- [ ] **Step 2: Run the loading test and verify the primitives are absent**

Run:

```bash
pnpm tsx --test scripts/loading-ui.test.tsx
```

Expected: FAIL because `Skeleton` and `ProgressiveImage` do not exist.

- [ ] **Step 3: Add the shadcn-compatible Skeleton primitive**

Create the local component based on the official shadcn API:

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="skeleton"
            aria-hidden="true"
            className={cn('animate-pulse rounded-md bg-muted', className)}
            {...props}
        />
    );
}

export { Skeleton };
```

Do not initialize a new shadcn preset: the repository already owns local UI source files and has no `components.json`. Reuse semantic theme colors and the existing `tw-animate-css` dependency.

- [ ] **Step 4: Implement one stable progressive image owner**

Create `ProgressiveImage` with `loading`, `loaded`, and `failed` state. Reset state when `src` changes, detect an already-complete cached image through a ref effect, overlay `Skeleton` while pending, and fade the image from `opacity-0` to `opacity-100`. Render `fallback` after missing `src` or `error`.

The wrapper receives the stable size/aspect class. The image remains absolutely inset inside that wrapper, so loading state cannot resize cards.

- [ ] **Step 5: Adopt progressive images in the requested surfaces**

Replace raw image loading in:

- `MoviePoster`: preserve the Film/title fallback and `aspect-2/3`;
- `MovieCast`: preserve circular `size-14` portraits and initials fallback;
- person summary: preserve portrait dimensions and name fallback;
- `SeriesSeasons`: preserve each episode still's current aspect ratio;
- `MovieTrailers`: preserve card `aspect-video` and poster fallback.

Keep `loading="lazy"` off-screen. The main detail poster may use `loading="eager"` and `fetchPriority="high"`; cast, episodes, and trailer visuals stay lazy.

- [ ] **Step 6: Run focused tests and commit**

Add `test:loading-ui` and include it in `test`. Run:

```bash
pnpm test:loading-ui
pnpm test:movie-detail-rich
pnpm test:people
pnpm test:series-metadata
pnpm typecheck
git add package.json scripts/loading-ui.test.tsx src/components/ui/skeleton.tsx src/components/ui/progressive-image.tsx src/components/movies/MoviePoster.tsx src/components/movies/MovieCast.tsx src/components/movies/SeriesSeasons.tsx src/components/movies/MovieTrailers.tsx 'src/routes/people/$personId.tsx'
git commit -m "feat(ui): add skeleton image loading states"
git push origin main
```

Expected: loading, success, and error states pass without changing wrapper dimensions.

---

### Task 5: Router Progress And Page-Shaped Pending Skeletons

**Files:**
- Create: `src/components/loading/NavigationProgress.tsx`
- Create: `src/components/loading/RouteSkeletons.tsx`
- Modify: `src/router.tsx`
- Modify: `src/routes/__root.tsx`
- Modify: `src/routes/index.tsx`
- Modify: `src/routes/movies/index.tsx`
- Modify: `src/routes/movies/$movieId.tsx`
- Modify: `src/routes/people/$personId.tsx`
- Modify: `src/styles.css`
- Modify: `scripts/loading-ui.test.tsx`

**Interfaces:**
- Consumes: `Skeleton` from Task 4 and TanStack Router `state.status`.
- Produces: `NavigationProgress`, `CatalogPageSkeleton`, `MovieDetailSkeleton`, and `PersonDetailSkeleton`.
- Router defaults: `defaultPendingMs: 120`, `defaultPendingMinMs: 250`.

- [ ] **Step 1: Write failing pending-state tests and route contracts**

Extend `scripts/loading-ui.test.tsx`:

```ts
test('navigation progress only renders while pending', () => {
    const view = render(createElement(NavigationProgress, { pending: false }));
    assert.equal(view.queryByRole('progressbar'), null);
    view.rerender(createElement(NavigationProgress, { pending: true }));
    assert.ok(view.getByRole('progressbar', { name: 'Загрузка страницы' }));
});

test('route skeletons expose busy state and stable media shapes', () => {
    const view = render(createElement(MovieDetailSkeleton));
    assert.equal(view.getByLabelText('Загрузка фильма').getAttribute('aria-busy'), 'true');
    assert.ok(view.container.querySelector('.aspect-2\\/3'));
    assert.ok(view.container.querySelector('.aspect-video'));
});
```

Read route sources and assert:

- `src/router.tsx` contains `defaultPendingMs: 120` and `defaultPendingMinMs: 250`;
- catalog routes set `pendingComponent: CatalogPageSkeleton`;
- movie detail sets `pendingComponent: MovieDetailSkeleton`;
- person detail sets `pendingComponent: PersonDetailSkeleton`;
- root subscribes with `useRouterState` and renders `NavigationProgress`.

- [ ] **Step 2: Run the loading test and verify pending components fail**

Run:

```bash
pnpm test:loading-ui
```

Expected: FAIL because navigation progress and route skeletons do not exist.

- [ ] **Step 3: Add global router timing and header progress**

Set router defaults:

```ts
const router = createRouter({
    routeTree,
    context: {},
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultPendingMs: 120,
    defaultPendingMinMs: 250,
});
```

Implement `NavigationProgress({ pending }: { pending: boolean })`. While pending, render one `role="progressbar"` line under the header content with `aria-label="Загрузка страницы"`. Use semantic primary color and a CSS keyframe that moves/scales one bar; add a reduced-motion rule that replaces travel with a static pulse.

In `RootLayout`, subscribe narrowly:

```ts
const navigationPending = useRouterState({ select: (state) => state.status === 'pending' });
```

Render `NavigationProgress` as the final child of the sticky header and set `aria-busy={navigationPending}` on `main`. The header remains visible and the current page is not blanked while the next match loads.

- [ ] **Step 4: Build route-shaped skeletons from shadcn Skeleton**

Create compact components with the same outer spacing as real routes:

- `CatalogPageSkeleton`: toolbar row plus 8 poster card placeholders using `aspect-[3/4]`;
- `MovieDetailSkeleton`: title/header gap, `aspect-2/3` poster, summary lines, tabs/section lines, and one `aspect-video` trailer placeholder;
- `PersonDetailSkeleton`: portrait, identity lines, and filmography poster row.

Each root has `aria-busy="true"`, a concise Russian `aria-label`, and no visible instructional text. Every `Skeleton` is decorative and already `aria-hidden`.

- [ ] **Step 5: Attach pending components to high-traffic loader routes**

Add the correct `pendingComponent` to `/`, `/movies/`, `/movies/$movieId`, and `/people/$personId`. Do not attach catalog skeletons to mutation-heavy add/edit routes or chat, where replacing the existing page would disrupt user input.

- [ ] **Step 6: Run loading, route, hydration, and type checks**

Run:

```bash
pnpm test:loading-ui
pnpm test:catalog-header
pnpm test:movie-navigation-detail
pnpm test:movie-detail-rich
pnpm typecheck
pnpm build
```

Expected: tests, typecheck, and production build pass without hydration warnings.

- [ ] **Step 7: Commit and push navigation feedback**

```bash
git add scripts/loading-ui.test.tsx src/router.tsx src/routes/__root.tsx src/routes/index.tsx src/routes/movies/index.tsx 'src/routes/movies/$movieId.tsx' 'src/routes/people/$personId.tsx' src/components/loading/NavigationProgress.tsx src/components/loading/RouteSkeletons.tsx src/styles.css
git commit -m "feat(ui): show route loading feedback"
git push origin main
```

---

### Task 6: Documentation, Full Verification, And VDS Deployment

**Files:**
- Modify: `AGENTS.md`
- Modify: `src/routes/AGENTS.md`
- Modify: `src/server/AGENTS.md`

**Interfaces:**
- Documents: automatic video ownership, provider refresh semantics, shadcn Skeleton usage, pending timing, migration name, and focused test commands.
- Deploys: tracked `main` through the existing infra script; no production Git pull and no env edits.

- [ ] **Step 1: Update handoff documentation**

Document these exact rules:

- automatic `MovieVideo` rows are provider snapshots; `trailerUrls` remain manual;
- automatic videos import on add/explicit refresh and empty refreshes preserve old rows;
- detail pages merge local automatic/manual sources and create iframe players lazily;
- `Skeleton` and `ProgressiveImage` are the only loading placeholder path;
- router pending defaults are 120/250 ms and the selected loader routes own page skeletons;
- migration `20260821130000_movie_videos` must be deployed.

Add focused commands `pnpm test:movie-videos`, `pnpm test:movie-trailers`, and `pnpm test:loading-ui`.

- [ ] **Step 2: Run the complete verification suite**

Run fresh commands:

```bash
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

Expected: every command exits 0. Record exact test counts and any non-fatal build warnings in the final report.

- [ ] **Step 3: Commit and push documentation**

```bash
git add AGENTS.md src/routes/AGENTS.md src/server/AGENTS.md
git commit -m "docs: document automatic videos and loading states"
git push origin main
git status --short --branch
```

Expected: `main...origin/main` with no working-tree changes.

- [ ] **Step 4: Deploy tracked source to Timeweb VDS**

From the local machine, use the existing deployment helper rather than Git on production:

```bash
/Users/ayurash/Development/_Projects/ayurash-infra/scripts/deploy-app-source.sh ay-movies
ssh deploy@72.56.8.147 'cd /opt/ayurash && docker compose up -d --build ay-movies'
ssh deploy@72.56.8.147 'cd /opt/ayurash && docker compose ps ay-movies && docker compose logs --tail=120 ay-movies'
```

Expected: the container is `Up`, startup applies `20260821130000_movie_videos`, and logs contain no migration or runtime error.

- [ ] **Step 5: Verify production behavior without exposing tokens**

Check:

```bash
curl -fsS -o /dev/null -w '%{http_code}\n' https://movies.ayurash.ru/
curl -fsS -o /dev/null -w '%{http_code}\n' https://movies.ayurash.ru/movies
```

Expected: both return `200`. In a signed-in browser, refresh metadata for one known Kinopoisk title, confirm `Трейлеры и тизеры` appears, no iframe exists until selection, closing stops playback, and throttled navigation/poster loading shows progress and skeleton states without layout jumps.
