# Actor Card Roles Design

## Goal

Make compact actor cards readable on narrow screens and show the character each actor plays in the current movie or series.

## User Interface

- Keep the existing compact card layout with a round portrait and text on the right.
- Reduce the actor name slightly and allow it to wrap to at most two lines.
- Show the character name below in smaller muted text, also limited to two lines.
- Keep card dimensions stable when a name or role wraps.

## Metadata Enrichment

Kinopoisk movie responses contain cast members but often omit their character names. Kinopoisk person responses include the character in the matching filmography credit.

When loading full Kinopoisk metadata:

1. Build the ordered actor list from the movie response as today.
2. Fetch matching person records in batches of at most ten IDs, requesting only `id` and `movies`.
3. Find the credit for the current movie and copy its `description` into the actor's `role`.
4. Preserve the original actor order and leave `role` empty when enrichment is unavailable.

The import remains usable when the enrichment request fails: core movie metadata and cast are still returned.

## Existing Data

Existing movies receive roles through the normal metadata refresh action. After deployment, refresh the stored metadata for "Игра престолов" so its actor roles become visible immediately.

## Verification

- Provider tests cover batching, role mapping, order preservation, and graceful fallback.
- Component tests verify two-line actor names and smaller two-line role text.
- Run the full test suite, typecheck, and production build before deployment.
