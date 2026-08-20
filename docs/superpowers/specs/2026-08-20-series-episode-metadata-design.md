# Detailed Series Episodes

## Goal

Store and display complete season and episode metadata for series: season number,
episode number, Russian and original titles, release date, description, and an
optional still image. Metadata is imported automatically; users do not edit
episodes manually.

## Providers

- `kinopoisk.dev` is the primary provider when `KINOPOISK_DEV_TOKEN` is set. Its
  `/v1.4/season` response contains season metadata and detailed episodes.
- `kinopoiskapiunofficial.tech` remains a fallback. Its
  `/api/v2.2/films/{id}/seasons` response provides episode titles, release dates,
  and optional synopses.
- Wikipedia/Wikidata remains a fallback for basic movie metadata only and does
  not provide detailed episodes.

Provider IDs selected by the user are persisted on the movie. This makes later
updates deterministic and avoids searching for the same series again unless the
user explicitly chooses another candidate.

## Data Model

Add nullable metadata source fields to `Movie`:

- `metadataProvider`: the selected lookup provider;
- `metadataExternalId`: the provider's movie identifier;
- `metadataUpdatedAt`: time of the last successful detailed import.

Add normalized child models:

- `SeriesSeason`: movie relation, season number, localized/original names,
  descriptions, release date, duration, and optional poster URL;
- `SeriesEpisode`: season relation, episode number, localized/original names,
  descriptions, release date, and optional still URL.

Uniqueness constraints are `(movieId, number)` for seasons and
`(seasonId, number)` for episodes. Both relations cascade on movie deletion.

The existing `seasonsCount` and `episodesPerSeason` fields remain as summary
data for cards and backward compatibility. A successful detailed import updates
these summaries from normalized rows. Existing series without detailed rows
continue to render their current generic episode lists.

## Lookup And Save Flow

Lookup remains a two-step operation:

1. Search returns lightweight candidate cards with provider and external ID.
2. Selecting a candidate loads its full movie metadata and, for a series, the
   detailed seasons and episodes for that one candidate.

The selected detailed payload is held with the form state. Saving a new or
edited series writes movie fields, source identifiers, seasons, episodes, and
summary counts in one database transaction.

The edit page's `Обновить` action uses the stored provider ID by default. If the
user runs a new search and selects another candidate, the new source replaces
the stored source only after a successful save.

## Replacement Safety

Detailed rows are replaced only when the provider returns a valid, non-empty
season list. The replacement happens in a transaction:

1. validate and normalize season and episode numbers;
2. update movie metadata and summary counts;
3. delete previous normalized seasons;
4. create the new season and episode snapshot;
5. update `metadataUpdatedAt`.

If detailed loading fails or returns no seasons, existing normalized rows and
summary counts are preserved. The user sees that basic metadata was found but
episode details could not be refreshed.

## User Interface

Remove the manual `Сезонов` and `Серии` inputs from the movie form. Candidate
cards continue to show compact season and episode totals.

The `Сезоны и серии` tab keeps the horizontal season selector. For the active
season it renders:

- season title and episode count;
- numbered episode list;
- Russian title as the primary line;
- original title as the secondary line when it differs;
- localized release date;
- description when available;
- optional episode still without reserving empty space when absent.

The existing generic `Серия N` view is retained only as a fallback for legacy
series that have counts but no detailed episode rows.

## API And Types

Extend the internal lookup types with provider-neutral `seasons` and `episodes`
objects. Provider adapters map their different response shapes into this DTO.
Search responses stay lightweight; detailed episode payloads are returned only
by the candidate-selection server function.

Movie detail loading includes ordered seasons and episodes. Card and list
queries continue using summary fields and do not join detailed rows.

## Error Handling And Limits

- Provider failures are isolated; the fallback provider may still complete the
  lookup.
- Tokens remain server-only and are never serialized to the browser or logs.
- Only the selected candidate triggers detailed episode requests, limiting API
  usage and response size.
- Invalid dates and empty strings become `null`; duplicate and non-positive
  season or episode numbers are discarded before persistence.
- Remote image URLs are rendered through the existing image behavior and are
  not copied to S3 in this change.

## Migration And Compatibility

The Prisma migration adds the source fields and normalized tables without
removing existing columns. No destructive backfill is required. Old series use
their summary counts until an administrator or owner runs `Обновить` and saves
a provider result.

Production applies the migration through the existing `prisma migrate deploy`
container startup flow.

## Verification

- Unit tests for both provider mappers, including missing fields and unordered
  seasons/episodes.
- Tests for normalization and safe replacement behavior.
- Form-flow tests proving that choosing a candidate imports details and that a
  failed refresh preserves existing episodes.
- Detail-page tests for complete and legacy series data.
- `pnpm test:lookup`, relevant form tests, `pnpm typecheck`, and `pnpm build`.

## Out Of Scope

- Manual editing of seasons or episodes;
- live provider calls when opening a series page;
- scheduled background refreshes;
- scraping Kinopoisk or Apple TV pages;
- per-episode watch progress, ratings, or comments.
