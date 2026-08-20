# Final Broad Review Fix Set

## Findings and resolutions

1. **Partial series result stopped provider fallback.** Added the injectable
   `resolveMovieLookupDetails()` dispatcher. It keeps the selected provider
   first, skips empty `SERIES` snapshots, continues after loader exceptions,
   accepts empty non-series results, and returns no details when all series
   loaders are partial or unavailable.
2. **Nested metadata had no practical upper bounds.** Added the shared
   `seriesMetadataSnapshotSchema` and `SERIES_METADATA_LIMITS`. Both provider
   detail data and the movie write validator use the same schema: 100 seasons,
   1000 episodes per season, 5000 episodes total, bounded numbers/text/URLs,
   http(s)-only URLs, and validated `YYYY-MM-DD` dates.
3. **Series UI grammar and date format.** Added tested helpers for Russian
   episode forms and deterministic dates without the trailing year marker.
4. **Documentation.** Clarified that exact refresh starts with the stored
   source and falls back to title search after an error or empty result.

## Preserved rulings

- The selected provider remains first; Wikidata is still rejected before
  Kinopoisk loaders are imported.
- Source identifiers remain independent from timestamps.
- `metadataUpdatedAt` changes only after a successful detailed import.
- An empty snapshot still does not replace stored season rows or summaries.

## Tests

- `pnpm test` (56 tests)
- `pnpm typecheck`
- `pnpm build`
- `DATABASE_URL='postgresql://user:pass@127.0.0.1:5432/ay_movies' pnpm exec prisma validate`
- `git diff --check`

## Commit

`fix(series): harden episode metadata flow` on top of `ad53690`.
The resulting commit hash is recorded in the task handoff after commit.
