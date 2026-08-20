# Movie Lookup Providers And Review Flow

Date: 2026-08-20

## Goal

Add Kinopoisk-backed metadata lookup as an additional provider and stop auto-applying lookup results to movie forms. Adding and editing should show selectable result cards first. The user can choose a source card, reject all results, or keep filling fields manually.

Also add a persistent bottom form footer with `Отмена` and `Сохранить` actions on movie add/edit pages.

## Current State

- `src/server/movie-lookup.ts` returns the first acceptable `MovieLookup` result from Wikipedia/Wikidata.
- `src/routes/movies/new.tsx` immediately applies lookup data to `MovieForm`.
- `src/routes/movies/$movieId_.edit.tsx` immediately merges refreshed lookup data into current form defaults.
- `src/components/movies/MovieForm.tsx` owns submit state and renders its submit button inside the form.
- `src/server/AGENTS.md` notes that lookup currently uses Wikipedia/Wikidata without tokens.

## Provider Choice

Use `kinopoisk.dev` first, with Wikipedia/Wikidata as fallback.

Reasons:

- `kinopoisk.dev` has documented movie search, movie details, and season endpoints.
- It is token-based, so it can be disabled cleanly when env is missing.
- It should improve Russian title matching and series season/episode data compared with Wikidata alone.

Do not scrape Kinopoisk web pages. Apple TV and Kinopoisk pages can be treated later as outbound/source links, not as HTML metadata sources.

References:

- `https://kinopoiskdev.readme.io/reference/moviecontroller_searchmoviev1_4`
- `https://kinopoiskdev.readme.io/reference/moviecontroller_findonev1_4`
- `https://kinopoiskdev.readme.io/reference/seasoncontroller_findmanyv1_4`

## Environment

Add optional runtime env:

- `KINOPOISK_DEV_TOKEN`
- optional `KINOPOISK_DEV_BASE_URL`, defaulting to the public `kinopoisk.dev` API base.

If `KINOPOISK_DEV_TOKEN` is absent, the Kinopoisk provider is skipped and lookup still works through Wikipedia/Wikidata.

Update `.env.example` and project docs. Do not read or modify `.env`.

## Server Design

Introduce a provider-oriented lookup layer:

- `src/server/movie-lookup.ts` remains the public server function entrypoint.
- New provider modules live under `src/server/movie-lookup-providers/`.
- Wikipedia/Wikidata logic moves behind a provider adapter without changing its behavior.
- Kinopoisk provider maps API data into the same internal candidate shape.

New return shape:

```ts
type MovieLookupCandidate = MovieLookup & {
  provider: 'kinopoisk-dev' | 'wikidata';
  providerLabel: string;
  externalId?: string;
  sourceUrl?: string;
  rating?: number | null;
  confidence?: number;
};
```

New server function:

```ts
lookupMovieCandidates({ title, kind? }): {
  ok: true;
  candidates: MovieLookupCandidate[];
} | {
  ok: false;
  error: string;
}
```

Keep `lookupMovie` temporarily as a compatibility wrapper that picks the first candidate. Existing routes will migrate to `lookupMovieCandidates`.

Candidate ordering:

1. Kinopoisk exact/high-confidence matches.
2. Kinopoisk remaining useful matches.
3. Wikipedia/Wikidata fallback matches.

Limit the UI result set to a small number, normally 6-8 candidates.

## Mapping Rules

Kinopoisk fields should map conservatively:

- title: Russian name, fallback to alternative/original name.
- originalTitle: English/original name when present.
- kind: map movie/series/cartoon from API type and genres.
- year: release year.
- country: joined country names.
- description: description or shortDescription.
- posterUrl: preview/poster URL if present.
- genres: normalize through existing `normalizeGenreOptions`.
- director/starring: first useful persons from API payload.
- rating: Kinopoisk rating when available.
- seasonsCount and episodesPerSeason: fetch from season endpoint for series.

If a field is missing, leave it empty rather than guessing.

## UI Flow

Add a shared `LookupCandidatesDialog` or inline result panel used by both add and edit pages.

Search/refresh behavior:

1. User enters title or clicks `Обновить данные`.
2. Page calls `lookupMovieCandidates`.
3. Page shows result cards with minimal data:
   - poster
   - provider badge
   - title and original title
   - year, type, country
   - genres
   - rating if present
   - seasons/episodes summary for series
   - short description
4. User clicks `Заполнить` on one card.
5. Only then page applies candidate data to form defaults.
6. User can close/reject results and continue manually.

On edit, applying a candidate merges metadata into the current form defaults. Existing manually entered links, trailer URLs, watch links, and uploaded poster should not be cleared unless the selected candidate has a poster and the user has no current poster URL.

## Sticky Form Footer

Move add/edit primary actions to a persistent bottom footer:

- `Отмена`
- `Сохранить` / `Добавить фильм`

Implementation approach:

- Give `MovieForm` a stable `formId`.
- Let route pages render footer buttons with the HTML `form` attribute.
- Add `hideSubmitButton` or equivalent prop so the inner submit button is not duplicated.
- Bubble submit state from `MovieForm` to the route if the footer button needs disabled/loading state.
- Add bottom padding to the form page so the footer does not cover fields.
- Respect mobile safe areas.

Cancel behavior:

- New page: return to the previous catalog route when possible, otherwise `/`.
- Edit page: return to the movie detail page.

## Error Handling

- Missing Kinopoisk token: silently skip provider; optionally log on server in development.
- Kinopoisk rate limit/network failure: still show Wikipedia/Wikidata candidates if available.
- No candidates from any provider: show existing error message and keep manual form available.
- Invalid provider payload: skip that candidate, do not fail the entire lookup.

## Testing

Add focused tests/scripts for:

- Kinopoisk API payload mapping, including series seasons and episodes.
- Provider fallback when Kinopoisk env is missing.
- Add page does not auto-fill before candidate selection.
- Edit page refresh shows candidates before applying.
- Sticky footer exposes cancel/save and does not duplicate submit buttons.

Run:

- `pnpm typecheck`
- `pnpm build`
- Existing focused route/component scripts if available.

## Deployment

After implementation:

1. Commit and push to `origin main`.
2. Deploy to the Timeweb VDS with the existing source deploy flow.
3. Ensure production env contains `KINOPOISK_DEV_TOKEN`; without it the feature should still work through fallback providers.
