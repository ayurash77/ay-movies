# Movie Details, People, Ratings, And Reviews

## Goal

Make movie and series detail pages denser and more useful without copying the
Kinopoisk interface literally. Remove repeated metadata from the description,
show provider ratings and a visual cast, add first-class person pages with full
filmography, and present existing user comments as reviews with author avatars.

## Scope

This change covers four connected areas:

- movie/series detail page composition;
- provider metadata for ratings and cast;
- person profile and filmography pages;
- conversion of the current comment experience into reviews.

External Kinopoisk reviews are not imported. Reviews remain user-created
content owned by AY Movies.

## Chosen Architecture

Use a hybrid provider cache:

- movie ratings and cast are imported with the selected movie metadata and
  persisted locally, so opening a movie page never requires a provider call;
- a person profile and full filmography are loaded from `kinopoisk.dev` on the
  first visit and cached in PostgreSQL;
- stale person data may be refreshed after seven days, while valid cached data
  remains usable if the provider is unavailable;
- local movies are matched to filmography entries through the persisted
  Kinopoisk external ID.

This avoids both repeated API calls on every page view and a full mirror of the
provider database.

## Movie Detail Layout

The existing top summary keeps the poster, year, country, genres, director,
duration, and watch status. The `Описание` section no
longer renders `DetailsTable`; it contains only the stored description text.

The `О сериале` tab and regular movie page then render these sections in order:

1. trailers, when present;
2. description text;
3. provider and AY Movies ratings;
4. cast grid;
5. watch links, when present;
6. user reviews.

The series `Сезоны и серии` tab remains unchanged. Metadata already visible in
the top summary is not repeated inside `Описание`.

## Ratings

Persist nullable rating snapshots on `Movie`:

- Kinopoisk rating and vote count;
- IMDb rating and vote count;
- Russian film critics percentage and vote count when available.

The detail page shows these values in one compact rating band. Provider scores
use their native ten-point or percentage scales. The existing AY Movies rating
remains a separate five-point score and retains the current interactive rating
control for authenticated users. Missing provider values do not reserve empty
tiles.

Rating snapshots update only after a successful detailed metadata load. A
partial provider response must not erase previously stored non-null values.

## Cast Data

Add a normalized `Person` record identified by `(provider, externalId)` with
the fields needed by movie cards and a person profile: localized/original name,
photo, sex, height, birth/death dates, birth place, professions, facts, and
cache timestamp.

Add an ordered movie-to-person credit relation containing profession and role.
During movie creation or metadata refresh, the `kinopoisk.dev` adapter maps
actor IDs, names, photos, and character descriptions into provider-neutral cast
DTOs. Saving a successful non-empty cast snapshot upserts people and replaces
the movie's actor credits in the same transaction as the movie metadata.

If rich cast data is absent, the existing `starring` string list remains a
text fallback. A failed or empty cast response never removes previously saved
credits.

## Cast Interface

Show the leading actors as a responsive grid rather than a comma-separated
line. Each item contains a portrait, actor name, and role when available. The
whole item links to `/people/$personId`. A compact `Все` control expands the
complete imported cast without introducing a separate modal.

Images keep stable dimensions and use the existing placeholder behavior when a
provider photo is absent or fails to load. The layout uses two columns on small
mobile widths and expands to four or more columns when space permits.

## Person Page

The person route has the standard application header with a back action. Its
summary contains portrait, localized and original names, professions, age,
birth date and place, height, and death date where applicable.

The filmography contains all acting credits returned by the provider, not only
movies already present in AY Movies. Person credits are enriched in bounded
batches through the Kinopoisk movie endpoint so cards can show title, year,
poster, type, rating, and role. Duplicate credits are collapsed by external
movie ID.

Filmography entries matching local `Movie.metadataExternalId` link to the local
detail page. Other entries open their Kinopoisk page in a new tab. Entries with
incomplete enrichment still render their title and role from the person
response.

The cached filmography is stored as a validated provider-neutral JSON snapshot
on the person record. A seven-day TTL limits API usage. Refresh failures return
the last valid snapshot; a person with neither provider data nor cache gets a
clear unavailable state instead of an application error.

## Reviews

The existing `Comment` rows are preserved in place and exposed as reviews in
server APIs and UI. Add nullable `title`, a sentiment with values `POSITIVE`,
`NEUTRAL`, and `NEGATIVE`, and `updatedAt`. Existing rows migrate to neutral
reviews with no generated title, retaining their author, text, and date.

New reviews contain:

- author avatar and name;
- creation date and an edited marker when applicable;
- optional concise title;
- positive, neutral, or negative sentiment;
- review text.

The review form replaces the current comment form. Existing multiplicity is
preserved: the migration does not delete or merge multiple comments by one
author. Authors may edit or delete their reviews; administrators may edit or
delete any review. Clicking an author opens the existing user profile dialog.

All visible copy changes from `комментарий` to `рецензия`, including empty
states, profile/dashboard counters, accessibility labels, and notifications.
Notification delivery and follower audience rules remain unchanged.

## Provider And Save Flow

Extend `MovieLookupDetails` with optional provider-neutral `ratings` and
`cast`. Lightweight search candidate payloads remain compact. Full cast and
rating data are requested only after the user selects a search result or runs
`Обновить` for a saved movie.

`kinopoisk.dev` is the rich-data source. Other adapters may return no rich cast
or vote counts without breaking validation. Provider tokens stay server-only
and no raw provider payload is serialized to the browser.

## Migration And Compatibility

The Prisma migration is additive:

- add nullable external rating fields to `Movie`;
- add `Person` and ordered movie credit storage;
- add the person filmography cache and refresh timestamp;
- add review title, sentiment, and update timestamp to the existing comment
  table.

Existing movie, rating, and comment data remain valid. Existing titles do not
receive provider ratings or visual cast until their metadata is refreshed.
Their current `starring` text remains visible as fallback.

Production applies the migration through the existing `prisma migrate deploy`
startup flow.

## Error Handling And Limits

- Person and filmography provider requests use timeouts and bounded batches.
- Cache refresh failures never invalidate the previous valid snapshot.
- Filmography and cast DTOs enforce limits on item counts and string/URL sizes.
- Invalid dates, scores, vote counts, and external IDs are discarded during
  normalization.
- Remote provider images use the existing image fallback and are not copied to
  user-upload S3 storage.
- Review title and text lengths are validated on the server; empty review text
  is rejected.

## Verification

- Mapper tests for ratings, votes, cast IDs, photos, roles, and missing fields.
- Persistence tests proving successful snapshot replacement and preservation
  after partial or failed refreshes.
- Person cache tests for fresh cache, stale refresh, fallback after provider
  failure, filmography deduplication, and local movie matching.
- Review migration/API tests for old neutral rows, avatars, editing,
  authorization, administrator control, and notification wording.
- Route/component contract tests for description deduplication, rating tiles,
  cast links, person filmography links, and review labels.
- Full `pnpm test`, `pnpm typecheck`, and `pnpm build` before deployment.

## Out Of Scope

- importing or copying Kinopoisk review text;
- scheduled background refresh of every person;
- creating local placeholder movie pages for external filmography entries;
- copying provider portraits or posters into the user-upload S3 bucket;
- following or favoriting actors.
