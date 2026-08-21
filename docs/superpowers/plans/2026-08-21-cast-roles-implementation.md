# Actor Card Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show readable two-line actor names and character roles, and populate missing Kinopoisk roles during metadata import.

**Architecture:** Keep `MovieCast` responsible only for presentation. Extend the Kinopoisk provider with a bounded batch enrichment step that requests person filmographies for the actors already selected from the movie response, maps matching credit descriptions back by person ID, and preserves the original cast order.

**Tech Stack:** React 19, Tailwind CSS 4, TypeScript, TanStack Start, Kinopoisk.dev API, `node:test` with `tsx` and Testing Library.

## Global Constraints

- Keep the existing compact card layout and round 48 px portraits.
- Limit names and roles to two visible lines without ellipsis-only single-line truncation.
- Request person data in batches of at most ten IDs.
- Metadata import must still succeed when role enrichment is unavailable.
- Do not expose API tokens in logs, tests, or source.
- Run the full test suite, typecheck, and production build before deployment.

---

## File Structure

- Modify `src/server/movie-lookup-providers/kinopoisk-dev.ts`: load character roles in batched person requests and merge them into rich cast metadata.
- Modify `scripts/movie-lookup.test.ts`: cover batching, mapping, order, and enrichment failure.
- Modify `src/components/movies/MovieCast.tsx`: allow two-line names and roles with smaller typography.
- Modify `scripts/movie-detail-rich.test.ts`: assert the compact wrapping styles.
- Modify `src/server/AGENTS.md` and `src/components/AGENTS.md` only if their cast/provider contracts need clarification.

---

### Task 1: Kinopoisk Cast Role Enrichment

**Files:**
- Modify: `src/server/movie-lookup-providers/kinopoisk-dev.ts`
- Test: `scripts/movie-lookup.test.ts`

**Interfaces:**
- Consumes: `movieId: string` and the ordered `MovieCastMember[]` returned by `mapKinopoiskRichMetadata`.
- Produces: the same ordered cast with `role` populated from each person's matching `movies[].description` credit.

- [ ] **Step 1: Write failing provider tests**

Mock `globalThis.fetch` for movie, season, and person-list endpoints. Use eleven actors so the assertion proves batching at ten IDs, then return person credits in reverse order:

```ts
assert.equal(personRequests.length, 2);
assert.equal(personRequests[0]?.searchParams.getAll('id').length, 10);
assert.equal(personRequests[1]?.searchParams.getAll('id').length, 1);
assert.deepEqual(
    details?.cast.map(({ externalId, role }) => ({ externalId, role })),
    Array.from({ length: 11 }, (_, index) => ({
        externalId: String(index + 1),
        role: `Персонаж ${index + 1}`,
    })),
);
```

Add a second test where the person endpoint returns HTTP 503 and assert that `loadKinopoiskCandidate` still returns the movie, seasons, ratings, and cast with null roles.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm test:lookup`

Expected: FAIL because `loadKinopoiskCandidate` does not request `/v1.4/person` and roles remain null.

- [ ] **Step 3: Implement batched enrichment**

Add a person-list response type and a helper that chunks missing-role actor IDs by ten, requests only `id` and `movies`, and creates a role map:

```ts
type KinopoiskPersonResponse = { docs?: KinopoiskPersonProfile[] };
const CAST_ROLE_BATCH_SIZE = 10;

async function loadKinopoiskCastRoles(movieId: string, cast: MovieCastMember[]) {
    const roleByPersonId = new Map<string, string>();
    const ids = cast.filter((member) => !member.role).map((member) => member.externalId);

    for (let offset = 0; offset < ids.length; offset += CAST_ROLE_BATCH_SIZE) {
        const chunk = ids.slice(offset, offset + CAST_ROLE_BATCH_SIZE);
        const params = new URLSearchParams({ limit: String(chunk.length) });
        for (const id of chunk) params.append('id', id);
        for (const field of [ 'id', 'movies' ]) params.append('selectFields', field);
        const response = await kinopoiskJson<KinopoiskPersonResponse>('/v1.4/person', params);
        if (!response) return null;
        for (const person of response?.docs ?? []) {
            const personId = externalId(person.id);
            const credit = person.movies?.find((movie) => externalId(movie.id) === movieId);
            const role = boundedText(credit?.description);
            if (personId && role) roleByPersonId.set(personId, role);
        }
    }

    return cast.map((member) => ({
        ...member,
        role: member.role ?? roleByPersonId.get(member.externalId) ?? null,
    }));
}
```

In `loadKinopoiskCandidate`, build rich metadata once, attempt enrichment, and use `enrichedCast ?? rich.cast` so any failed enrichment batch returns the original cast. Preserve cast ordering and all other detail fields.

- [ ] **Step 4: Run provider tests**

Run: `pnpm test:lookup`

Expected: PASS, including batching and graceful fallback cases.

---

### Task 2: Two-Line Compact Actor Cards

**Files:**
- Modify: `src/components/movies/MovieCast.tsx`
- Test: `scripts/movie-detail-rich.test.ts`

**Interfaces:**
- Consumes: existing `MovieCastPerson.name` and nullable `MovieCastPerson.role`.
- Produces: stable compact cards with a two-line name and a smaller two-line role.

- [ ] **Step 1: Write the failing component assertion**

Extend the compact cast test:

```ts
const name = renderer.getByRole('heading', { level: 3 });
const role = renderer.getByText('Роль 1');
assert.match(name.className, /line-clamp-2/);
assert.doesNotMatch(name.className, /truncate/);
assert.match(role.className, /line-clamp-2/);
assert.match(role.className, /text-\[11px\]/);
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm test:movie-detail-rich`

Expected: FAIL because names and roles currently use `truncate`.

- [ ] **Step 3: Update card typography**

Use two-line clamps and explicit smaller sizes while keeping the current card grid and portrait:

```tsx
<h3 className="line-clamp-2 text-[13px] font-semibold leading-snug group-hover:text-primary">
    {member.name}
</h3>
{member.role ? (
    <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
        {member.role}
    </p>
) : null}
```

- [ ] **Step 4: Run component and provider tests**

Run: `pnpm test:movie-detail-rich && pnpm test:lookup`

Expected: PASS.

---

### Task 3: Verification, Production Refresh, And Delivery

**Files:**
- Modify documentation only if implementation changes the documented contract.

**Interfaces:**
- Consumes: deployed application with configured `KINOPOISK_DEV_TOKEN`.
- Produces: production actor cards with stored character roles for "Игра престолов".

- [ ] **Step 1: Run repository verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

Expected: all commands exit with code 0.

- [ ] **Step 2: Review the final diff**

Check that no secret or unrelated change is present and that enrichment failure does not discard movie metadata.

- [ ] **Step 3: Commit and push**

```bash
git add src/server/movie-lookup-providers/kinopoisk-dev.ts src/components/movies/MovieCast.tsx scripts/movie-lookup.test.ts scripts/movie-detail-rich.test.ts
git commit -m "fix(movies): show actor character roles"
git push origin main
```

- [ ] **Step 4: Deploy and refresh existing data**

Deploy `main` through the documented VDS source-sync workflow. Before changing production data, create a PostgreSQL backup. Refresh metadata for movie external ID `464963` using the deployed provider path, then verify that `MoviePersonCredit.role` is populated without changing credit order.

- [ ] **Step 5: Production smoke check**

Verify `https://movies.ayurash.ru` returns HTTP 200 and the detail page renders actor names and roles without client errors.
