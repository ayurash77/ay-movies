# Automatic Trailers And Loading Feedback

## Goal

Automatically enrich movies, series, and animation with trailers and teasers
while preserving links entered by users. Make navigation and remote image
loading understandable on slow connections without causing layout shifts or
loading many video players before the user asks to watch one.

## Scope

This change covers two connected areas:

- structured automatic trailer metadata imported with movie details;
- loading feedback for route transitions and remote images.

Manual trailer links remain supported. Automatic videos supplement them and do
not replace or rewrite user-entered values.

## Chosen Architecture

Use a persisted provider snapshot for automatic videos:

- fetch videos from Kinopoisk Unofficial only during movie creation or an
  explicit metadata refresh;
- normalize, filter, deduplicate, and store the usable results in PostgreSQL;
- render movie details exclusively from the local database;
- keep the existing `Movie.trailerUrls` array as manual user content;
- merge automatic and manual videos only in the detail-page presentation.

This follows the existing ratings, cast, and series metadata architecture. A
movie page does not make a provider request and remains usable when Kinopoisk is
slow or unavailable.

Live provider requests on every detail-page visit were rejected because they
would increase latency and API usage. Writing automatic URLs directly into
`trailerUrls` was rejected because it would lose titles, video types, source
information, ordering, and ownership boundaries between provider and user
data.

## Data Model

Add a normalized `MovieVideo` child of `Movie` with cascade delete. Each row
contains:

- source provider;
- source site or player type;
- title;
- normalized kind: `TRAILER` or `TEASER`;
- URL;
- stable display position.

Rows are unique by movie and normalized URL. Provider payloads are never stored
verbatim. Nullable fields that the current endpoint does not reliably expose,
such as duration, publication date, or thumbnail, are not invented.

The existing `trailerUrls` field stays unchanged and continues to be edited as
individual manual inputs. No migration of manual links into provider rows is
performed.

## Provider Import

Extend detailed metadata with a provider-neutral `videos` snapshot. For a
positive Kinopoisk external ID, the Kinopoisk Unofficial adapter requests the
film videos endpoint and maps only usable trailer and teaser entries.

Normalization rules:

- accept names containing trailer/teaser equivalents in Russian or English;
- reject behind-the-scenes footage, interviews, clips, auditions, and other
  extras unless they are also explicitly identified as a trailer or teaser;
- accept only valid HTTPS URLs from supported player sites;
- normalize URLs before deduplication;
- apply a bounded item count and string lengths;
- preserve a stable provider order, with trailers before teasers when the
  provider does not supply a meaningful rank.

The selected metadata provider remains authoritative for ordinary movie data.
Video enrichment may use Kinopoisk Unofficial when the selected candidate has
a compatible Kinopoisk ID, including a candidate originally loaded through
`kinopoisk.dev`.

A successful non-empty video snapshot replaces the previous automatic rows in
the same transaction as other detailed metadata. An empty response, timeout,
invalid payload, unavailable token, or provider error preserves the previous
automatic videos. Manual links are never modified by provider refresh.

## Trailer Interface

The detail page shows a section named `Трейлеры и тизеры` when at least one
automatic or manual video exists.

The initial view is a horizontal, responsive list of compact media cards. A
card contains a stable 16:9 visual area, play affordance, title, and source
label when known. Because the provider does not reliably return thumbnails,
the card uses the movie poster as a fallback visual rather than eagerly loading
an iframe. Manual links receive a generated title such as `Трейлер 1` and are
placed after automatic entries after URL deduplication.

Selecting a card opens one video in a dialog. The iframe or external player is
created only after that selection. Supported embed URLs use the current safe
YouTube, Vimeo, and Kinopoisk widget conversion. Unsupported but valid manual
links open in a new tab.

The `Все` action opens the full merged list when more entries exist than the
compact preview shows. Closing the dialog removes the player so playback and
network activity stop.

## Loading Feedback

Loading feedback has three layers rather than replacing the entire current page
immediately:

1. A thin theme-aware progress indicator appears under the sticky application
   header while TanStack Router has a pending navigation.
2. High-traffic loader routes use page-shaped pending skeletons for catalog,
   movie details, and person details. Skeletons preserve the final layout's
   dimensions and appear after a short delay to avoid flicker on fast loads.
3. Shared image components render a local skeleton until `load` or `error`,
   then fade in the poster, portrait, episode image, or trailer visual without
   changing its dimensions.

Pending feedback should appear after approximately 100-150 ms and, once
visible, remain long enough to be perceived without flashing. Motion respects
`prefers-reduced-motion`. Loading containers expose `aria-busy`, and decorative
skeletons are hidden from assistive technology.

Navigation keeps the existing page usable until the next route is ready. The
header indicator confirms the click immediately; the page skeleton is used
when the destination loader exceeds the pending threshold. Mutations that
already own a button keep local pending state and disable duplicate submission.

## Image Behavior

Introduce one shared skeleton primitive and reuse it in image-owning
components. At minimum this includes movie posters and cast/person portraits;
the same primitive is available for episode stills and trailer cards.

Each image wrapper has an explicit size or aspect ratio. A failed image changes
to the existing semantic placeholder instead of leaving a permanent skeleton.
Native lazy loading remains enabled for off-screen images. Above-the-fold
detail media may load eagerly when that is already the component's behavior.

## Migration And Compatibility

The Prisma migration is additive: it creates `MovieVideo` and its indexes
without changing existing movies or manual `trailerUrls`.

Existing titles continue to show their manual trailers immediately. Automatic
videos appear after the movie metadata is refreshed. Newly added titles import
them together with other detailed metadata. A separate bulk provider backfill
is outside the initial migration and may be run later through a bounded admin
operation if needed.

Production applies the migration through the existing `prisma migrate deploy`
container startup flow. Provider tokens remain server-only and are not exposed
to loaders, browser bundles, logs, or serialized raw responses.

## Error Handling And Limits

- Provider requests use the existing timeout and fallback boundaries.
- Invalid, unsupported, duplicate, or overlong video entries are discarded.
- Failed refreshes preserve the last valid automatic snapshot.
- Player URLs are converted through an allowlisted embed helper; raw HTML from
  providers is never rendered.
- An iframe is created for only the selected video.
- Manual links remain visible even when automatic enrichment is unavailable.
- Skeletons always resolve to content, an empty state, or an error placeholder.

## Verification

- Provider mapper tests for trailer/teaser filtering, site mapping, invalid
  URLs, duplicates, ordering, limits, and empty responses.
- Persistence tests proving successful snapshot replacement and preservation
  after partial or failed refreshes.
- Form-flow tests proving automatic videos are imported on add/refresh while
  manual `trailerUrls` remain unchanged.
- Detail tests for automatic/manual merge, URL deduplication, ordering, `Все`,
  lazy player creation, supported embeds, and external-link fallback.
- Loading-state tests for router pending indication, delayed skeletons, image
  load/error transitions, stable dimensions, and reduced motion.
- Full `pnpm test`, `pnpm typecheck`, and `pnpm build` before deployment.

## Out Of Scope

- importing clips, interviews, behind-the-scenes videos, or provider reviews;
- downloading provider videos or thumbnails into user S3 storage;
- background refresh on every movie page visit;
- scheduled bulk refresh of the full library;
- inventing duration or publication dates absent from the provider response;
- redesigning every mutation button in the application.
