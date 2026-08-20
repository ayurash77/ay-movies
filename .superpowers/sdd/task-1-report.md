# Task 1 Report: Provider-Neutral Ratings And Cast DTOs

## Scope

- Added provider-neutral `ExternalRatings` and `MovieCastMember` DTOs with bounded Zod schemas.
- Extended `MovieLookupDetails` with optional external ratings and a default empty cast snapshot.
- Added pure Kinopoisk rich metadata mapping for ratings, votes, and actor credits.
- Kept `MovieLookupCandidate` and the search flow free of rich cast data.

## TDD evidence

- RED: `pnpm test:lookup` failed because `mapKinopoiskRichMetadata` was not exported.
- GREEN: after implementation, `pnpm test:lookup` passed with 24/24 tests.

## Validation

- `pnpm test:lookup` passed: 24 tests.
- `pnpm build` passed and regenerated the ignored TanStack route tree required by TypeScript.
- `pnpm typecheck` passed after route generation.
- `pnpm test` passed: all configured test suites completed successfully.

## Implementation details

- `externalRatingSchema` bounds score values to 0..100 and vote counts to 0..2,000,000,000.
- `movieCastMemberSchema` validates provider, identifier, names, HTTP(S) portrait URL, actor profession, role, and position.
- `mapKinopoiskRichMetadata()` retains actors only, drops invalid person IDs and scores, nulls invalid portrait URLs, deduplicates by external ID, and caps cast at 100 entries.
- `loadKinopoiskCandidate()` merges rich metadata only after the detailed Kinopoisk response has loaded.

## Self-review

No findings. The implementation matches the Task 1 brief and does not access environment variables, tokens, or secrets.

## Concern

The first direct `pnpm typecheck` failed because `src/routeTree.gen.ts` is ignored and absent in this fresh worktree. This is an existing generation prerequisite, not a Task 1 defect. Running the repository's standard `pnpm build` generated the file, after which `pnpm typecheck` passed.

## Fix Review Findings

### RED/GREEN

- RED: after adding regression coverage for string person IDs `abc`, `0`, and `-1`, `pnpm test:lookup` failed with 24/25 tests. The first invalid ID was incorrectly included in cast metadata as `externalId: 'abc'`.
- GREEN: after the minimal validation fix, `pnpm test:lookup` passed with 25/25 tests.
- `pnpm typecheck` passed with exit code 0.

### Changed files

- `scripts/movie-lookup.test.ts` — added regression coverage for the three invalid string IDs.
- `src/server/movie-lookup-providers/kinopoisk-dev.ts` — accepts string person IDs only when they are positive decimal safe integers.
- `.superpowers/sdd/task-1-report.md` — appended this finding-fix record.

### Self-review

- The fix is limited to the reported `person.id` validation path and preserves existing valid numeric and string IDs.
- No environment files, tokens, or unrelated scope were changed.
- No remaining concerns identified.
