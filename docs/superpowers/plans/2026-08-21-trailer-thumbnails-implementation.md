# Trailer Thumbnails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Показывать у каждого трейлера собственное превью и никогда не использовать постер фильма как изображение всех роликов.

**Architecture:** `MovieVideo` хранит nullable `thumbnailUrl` как часть локального provider snapshot. YouTube preview вычисляется из URL, Kinopoisk Widget preview один раз извлекается сервером из JSON `data-state` страницы плеера с ограниченным параллелизмом; movie detail читает только БД. UI использует thumbnail конкретного видео или нейтральный стабильный fallback.

**Tech Stack:** TypeScript, React 19, TanStack Start, Zod 4, Prisma 6/PostgreSQL, Node test runner, Testing Library.

## Global Constraints

- Не создавать iframe до клика по карточке трейлера.
- При ошибке получения preview не отменять импорт фильма или других видео.
- Разрешать только HTTPS thumbnail URL длиной не более 2048 символов.
- Не выполнять сетевой backfill в миграции; старые записи обновляются действием `Обновить`.
- Не использовать постер фильма как fallback трейлера.

---

### Task 1: Thumbnail в video snapshot и БД

**Files:**
- Modify: `src/lib/movie-videos.ts`
- Modify: `src/server/movie-rich-metadata.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260821170000_movie_video_thumbnails/migration.sql`
- Test: `scripts/movie-videos.test.ts`
- Test: `scripts/movie-rich-metadata.test.ts`

**Interfaces:**
- Produces: `MovieVideoMetadata.thumbnailUrl: string | null`.
- Produces: `DisplayMovieVideo.thumbnailUrl: string | null`.
- Produces: `youtubeMovieVideoThumbnail(value: string): string | null`.

- [ ] **Step 1: Write failing snapshot and persistence tests**

Add assertions that a YouTube URL resolves to
`https://i.ytimg.com/vi/<id>/hqdefault.jpg`, an invalid/non-YouTube URL returns
`null`, `normalizeMovieVideoSnapshot()` preserves a valid `thumbnailUrl`, and
`writeMovieRichMetadata()` passes that field to `movieVideo.createMany()`.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm test:movie-videos && pnpm test:rich-metadata`

Expected: FAIL because `youtubeMovieVideoThumbnail` and `thumbnailUrl` do not exist.

- [ ] **Step 3: Extend schemas and persistence**

Use this public shape:

```ts
export const movieVideoMetadataSchema = z.object({
    // existing fields
    thumbnailUrl: z.string()
        .trim()
        .max(MOVIE_VIDEO_LIMITS.maxUrlLength)
        .url()
        .refine((value) => new URL(value).protocol === 'https:')
        .nullable()
        .optional()
        .transform((value) => value ?? null),
});

export function youtubeMovieVideoThumbnail(value: string) {
    const supported = supportedMovieVideoUrl(value);
    return supported?.key.startsWith('youtube:')
        ? `https://i.ytimg.com/vi/${supported.key.slice('youtube:'.length)}/hqdefault.jpg`
        : null;
}
```

Add `thumbnailUrl String? @db.VarChar(2048)` to `MovieVideo`, include it in
`MovieRichMetadataWriter.movieVideo.createMany`, and add the migration:

```sql
ALTER TABLE "MovieVideo" ADD COLUMN "thumbnailUrl" VARCHAR(2048);
```

- [ ] **Step 4: Generate Prisma client and verify GREEN**

Run: `pnpm db:generate && pnpm test:movie-videos && pnpm test:rich-metadata`

Expected: PASS.

- [ ] **Step 5: Commit and push**

```bash
git add prisma src/lib/movie-videos.ts src/server/movie-rich-metadata.ts scripts/movie-videos.test.ts scripts/movie-rich-metadata.test.ts
git commit -m "feat(movies): persist trailer thumbnails"
git push origin main
```

---

### Task 2: Kinopoisk Widget preview enrichment

**Files:**
- Create: `src/server/movie-video-thumbnails.ts`
- Modify: `src/server/movie-lookup-providers/kinopoisk-unofficial.ts`
- Create: `scripts/movie-video-thumbnails.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `MovieVideoMetadata` and `youtubeMovieVideoThumbnail()`.
- Produces: `kinopoiskWidgetThumbnailFromHtml(html: string, trailerId: string): string | null`.
- Produces: `enrichMovieVideoThumbnails(videos: MovieVideoMetadata[], loadHtml?: (url: string, signal: AbortSignal) => Promise<string | null>): Promise<MovieVideoMetadata[]>`.

- [ ] **Step 1: Write failing parser and enrichment tests**

Use a minimal encoded fixture:

```ts
const state = encodeURIComponent(JSON.stringify({
    models: { trailers: { '51149': { img: {
        bigPreviewUrl: { x1: '//avatars.mds.yandex.net/trailer/540x304' },
    } } } },
}));
const html = `<script type="application/json" data-state>${state}</script>`;
```

Assert exact trailer ID lookup, normalization to
`https://avatars.mds.yandex.net/trailer/540x304`, rejection of a different ID,
and enrichment of two widget videos with no more than four simultaneous
`loadHtml` calls. Assert YouTube gets a thumbnail without calling `loadHtml`.

- [ ] **Step 2: Run test and verify RED**

Run: `pnpm test:movie-video-thumbnails`

Expected: FAIL because the new server module does not exist.

- [ ] **Step 3: Implement bounded enrichment**

Parse only the `application/json[data-state]` payload, then read:

```ts
state.models.trailers[trailerId].img.bigPreviewUrl.x1
    ?? state.models.trailers[trailerId].img.mediumPreviewUrl.x1
    ?? state.models.trailers[trailerId].img.previewUrl.x1
```

Use four workers over the normalized video array and one 10-second shared
deadline. Every fetch/parser error returns the original video with its previous
`thumbnailUrl`; it must not reject the whole operation.

- [ ] **Step 4: Enrich provider output**

Change `loadKinopoiskUnofficialVideos()` to call:

```ts
return enrichMovieVideoThumbnails(mapKinopoiskUnofficialVideos(json?.items ?? []));
```

Add `test:movie-video-thumbnails` to `package.json` and the full `test` chain.

- [ ] **Step 5: Verify GREEN**

Run: `pnpm test:movie-video-thumbnails && pnpm test:lookup && pnpm test:movie-videos`

Expected: PASS.

- [ ] **Step 6: Commit and push**

```bash
git add src/server/movie-video-thumbnails.ts src/server/movie-lookup-providers/kinopoisk-unofficial.ts scripts/movie-video-thumbnails.test.ts package.json
git commit -m "feat(metadata): enrich trailer thumbnails"
git push origin main
```

---

### Task 3: Per-video preview UI

**Files:**
- Modify: `src/components/movies/MovieTrailers.tsx`
- Modify: `src/routes/movies/$movieId.tsx`
- Test: `scripts/movie-trailers.test.tsx`

**Interfaces:**
- Consumes: `DisplayMovieVideo.thumbnailUrl`.
- Removes: `MovieTrailersProps.posterUrl` and all poster fallback wiring.

- [ ] **Step 1: Write failing UI tests**

Render two automatic videos with different `thumbnailUrl` values and assert two
`img` elements use those exact URLs. Render one video with `thumbnailUrl: null`
and assert its card contains the neutral fallback and no movie poster URL.

- [ ] **Step 2: Run test and verify RED**

Run: `pnpm test:movie-trailers`

Expected: FAIL because every card still receives `posterUrl`.

- [ ] **Step 3: Render thumbnail from the video**

Change the visual boundary to:

```tsx
function VideoVisual({ thumbnailUrl, title }: {
    thumbnailUrl: string | null;
    title: string;
}) {
    return <ProgressiveImage src={thumbnailUrl ?? undefined} /* neutral fallback */ />;
}
```

Pass `video.thumbnailUrl` from `VideoCard`; remove `posterUrl` from component
props and from the movie detail call site. Keep the current lazy image, fixed
`aspect-video`, play button, dialog, and iframe lifecycle.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm test:movie-trailers && pnpm test:loading-ui && pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit and push**

```bash
git add src/components/movies/MovieTrailers.tsx src/routes/movies/'$movieId.tsx' scripts/movie-trailers.test.tsx
git commit -m "fix(ui): show individual trailer previews"
git push origin main
```

---

### Task 4: Documentation, verification, and deployment

**Files:**
- Modify: `AGENTS.md`
- Modify: `src/server/AGENTS.md`
- Modify: `src/components/AGENTS.md`

**Interfaces:**
- Documents the persisted preview snapshot, refresh behavior, and neutral fallback.

- [ ] **Step 1: Update handoff documentation**

Document `thumbnailUrl`, server-side Kinopoisk Widget enrichment, no network
reads on movie detail, and that old videos receive previews after `Обновить`.

- [ ] **Step 2: Run complete verification**

```bash
git diff --check
pnpm test
pnpm typecheck
pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 3: Commit and push docs**

```bash
git add AGENTS.md src/server/AGENTS.md src/components/AGENTS.md
git commit -m "docs: document trailer thumbnails"
git push origin main
```

- [ ] **Step 4: Deploy tracked source to VDS**

```bash
cd /Users/ayurash/Development/_Projects/ayurash-infra
./scripts/deploy-app-source.sh ay-movies /Users/ayurash/Development/_Projects/ay-movies
ssh deploy@72.56.8.147 'cd /opt/ayurash && docker compose up -d --build ay-movies'
```

- [ ] **Step 5: Verify production**

```bash
ssh deploy@72.56.8.147 'cd /opt/ayurash && docker compose exec -T ay-movies pnpm exec prisma migrate status && docker compose ps ay-movies'
curl -fsS -o /dev/null -w '%{http_code}\n' https://movies.ayurash.ru/
```

Expected: schema is up to date, service is `Up`, HTTP status is `200`.
