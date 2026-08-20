# Movie Lookup Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Kinopoisk-backed metadata candidates, make add/edit forms apply lookup data only after user selection, and move movie form actions into a persistent bottom footer.

**Architecture:** `src/server/movie-lookup.ts` becomes a thin server function entrypoint over provider modules. Providers return normalized `MovieLookupCandidate` objects; add/edit routes render a shared candidate picker and explicitly apply the selected candidate to `MovieForm` defaults. `MovieForm` exposes `formId`/submit state so routes can render fixed bottom actions.

**Tech Stack:** TanStack Start server functions, React 19, TypeScript, Zod, local shadcn-style UI primitives, `node:test` + `tsx`.

## Global Constraints

- Do not read or modify `.env`; add only `.env.example` docs.
- Keep server-only imports inside server handlers or provider modules that are never imported by client components.
- Missing `KINOPOISK_DEV_TOKEN` must not break lookup; skip Kinopoisk and keep Wikipedia/Wikidata fallback.
- Do not scrape Kinopoisk web pages.
- Do not clear existing trailer URLs, watch links, or uploaded poster data when applying lookup results.
- Mobile input font-size must stay at least 16px.
- After implementation run `pnpm typecheck`, `pnpm build`, commit, push, and deploy to Timeweb VDS.

---

## File Structure

- Create `src/lib/movie-lookup-types.ts`: shared lookup schemas, `MovieLookup`, `MovieLookupCandidate`, provider names, and `movieLookupCandidateSchema`.
- Create `src/server/movie-lookup-providers/wikidata.ts`: existing Wikipedia/Wikidata search logic wrapped as a provider.
- Create `src/server/movie-lookup-providers/kinopoisk-dev.ts`: token-based Kinopoisk API client and mapper.
- Modify `src/server/movie-lookup.ts`: expose `lookupMovieCandidates`, keep `lookupMovie` wrapper.
- Create `src/components/movies/LookupCandidates.tsx`: compact result cards and apply/reject actions.
- Modify `src/components/movies/MovieForm.tsx`: support external footer buttons via `formId`, `hideSubmitButton`, `onSubmittingChange`.
- Create `src/components/movies/MovieFormFooter.tsx`: persistent bottom `Отмена`/submit action bar.
- Modify `src/routes/movies/new.tsx`: show candidates before applying; use sticky footer.
- Modify `src/routes/movies/$movieId_.edit.tsx`: refresh shows candidates before merging; use sticky footer.
- Modify `.env.example`, `AGENTS.md`, `src/server/AGENTS.md`, `src/routes/AGENTS.md`.
- Add/modify tests in `scripts/movie-lookup.test.ts`, `scripts/movie-form-flow.test.ts`, `scripts/movie-edit-header.test.ts`, `package.json`.

---

### Task 1: Shared Lookup Candidate Types

**Files:**
- Create: `src/lib/movie-lookup-types.ts`
- Modify: `src/server/movie-lookup.ts`
- Modify: `scripts/movie-lookup.test.ts`

**Interfaces:**
- Produces:
  - `movieLookupSchema`
  - `movieLookupCandidateSchema`
  - `type MovieLookup`
  - `type MovieLookupCandidate`
  - `type LookupProvider = 'kinopoisk-dev' | 'wikidata'`
- Consumes: existing `movieKindOptions` from `src/lib/movie-data.ts`.

- [ ] **Step 1: Write the failing test**

Add to `scripts/movie-lookup.test.ts`:

```ts
import {
    movieLookupCandidateSchema,
    type MovieLookupCandidate,
} from '../src/lib/movie-lookup-types';

test('movie lookup candidate schema accepts provider metadata', () => {
    const candidate: MovieLookupCandidate = {
        found: true,
        provider: 'kinopoisk-dev',
        providerLabel: 'Кинопоиск',
        externalId: '123',
        sourceUrl: 'https://www.kinopoisk.ru/film/123/',
        confidence: 92,
        rating: 8.4,
        kind: 'SERIES',
        title: 'Игра престолов',
        originalTitle: 'Game of Thrones',
        year: 2011,
        country: 'США, Великобритания',
        description: 'Описание',
        director: null,
        genres: [ 'драма', 'фэнтези' ],
        starring: [ 'Питер Динклэйдж' ],
        durationMin: 55,
        seasonsCount: 8,
        episodesPerSeason: [ 10, 10, 10, 10, 10, 10, 7, 6 ],
        posterUrl: 'https://example.com/poster.jpg',
    };

    assert.deepEqual(movieLookupCandidateSchema.parse(candidate), candidate);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:lookup`

Expected: FAIL because `src/lib/movie-lookup-types.ts` does not exist.

- [ ] **Step 3: Add shared types**

Create `src/lib/movie-lookup-types.ts`:

```ts
import { z } from 'zod';

import { movieKindOptions } from './movie-data';

export const movieLookupSchema = z.object({
    found: z.boolean(),
    kind: z.enum(movieKindOptions).optional(),
    title: z.string().nullish(),
    originalTitle: z.string().nullish(),
    year: z.number().int().nullish(),
    country: z.string().nullish(),
    description: z.string().nullish(),
    director: z.string().nullish(),
    genres: z.array(z.string()).nullish(),
    starring: z.array(z.string()).nullish(),
    durationMin: z.number().int().nullish(),
    seasonsCount: z.number().int().nullish(),
    episodesPerSeason: z.array(z.number().int()).nullish(),
    posterUrl: z.string().nullish(),
});

export const lookupProviderSchema = z.enum([ 'kinopoisk-dev', 'wikidata' ]);

export const movieLookupCandidateSchema = movieLookupSchema.extend({
    provider: lookupProviderSchema,
    providerLabel: z.string(),
    externalId: z.string().nullish(),
    sourceUrl: z.string().nullish(),
    rating: z.number().nullish(),
    confidence: z.number().int().min(0).max(100).nullish(),
});

export type MovieLookup = z.infer<typeof movieLookupSchema>;
export type LookupProvider = z.infer<typeof lookupProviderSchema>;
export type MovieLookupCandidate = z.infer<typeof movieLookupCandidateSchema>;
```

Modify `src/server/movie-lookup.ts` imports:

```ts
import {
    movieLookupCandidateSchema,
    movieLookupSchema,
    type MovieLookup,
    type MovieLookupCandidate,
} from '@/lib/movie-lookup-types';
```

Remove the local `lookupResultSchema` and local `MovieLookup` type. Keep behavior unchanged in this task.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:lookup`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/movie-lookup-types.ts src/server/movie-lookup.ts scripts/movie-lookup.test.ts
git commit -m "refactor(lookup): share movie lookup candidate types"
```

---

### Task 2: Provider Modules And Candidate Entrypoint

**Files:**
- Create: `src/server/movie-lookup-providers/wikidata.ts`
- Modify: `src/server/movie-lookup.ts`
- Modify: `scripts/movie-lookup.test.ts`

**Interfaces:**
- Consumes: `MovieLookupCandidate` from Task 1.
- Produces:
  - `lookupWikidataCandidates(title: string): Promise<MovieLookupCandidate[]>`
  - `lookupMovieCandidates({ title, kind? })` server function
  - compatibility `lookupMovie({ title })` wrapper returning the first candidate as `movie`.

- [ ] **Step 1: Write the failing test**

Add to `scripts/movie-lookup.test.ts`:

```ts
import { readFileSync } from 'node:fs';

test('movie lookup exposes candidate entrypoint and keeps compatibility wrapper', () => {
    const source = readFileSync('src/server/movie-lookup.ts', 'utf8');

    assert.match(source, /lookupMovieCandidates/);
    assert.match(source, /lookupWikidataCandidates/);
    assert.match(source, /lookupMovie = createServerFn/);
    assert.match(source, /candidates\[0\]/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:lookup`

Expected: FAIL because `lookupMovieCandidates` and provider wrapper are not present.

- [ ] **Step 3: Move Wikidata logic behind provider**

Create `src/server/movie-lookup-providers/wikidata.ts` by moving the current helper functions from `src/server/movie-lookup.ts`: `delay`, `getJson`, `searchWiki`, `loadWikiPage`, `loadWikidata`, `entityLabels`, `firstSentences`, `buildMovie`.

Provider export:

```ts
export async function lookupWikidataCandidates(title: string): Promise<MovieLookupCandidate[]> {
    const candidates: MovieLookupCandidate[] = [];
    const seen = new Set<string>();

    const push = (movie: MovieLookup | null) => {
        if (!movie?.title || (!movie.description && !movie.year)) return;
        const key = `${movie.title}:${movie.year ?? ''}`.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        candidates.push({
            ...movie,
            provider: 'wikidata',
            providerLabel: 'Wikipedia / Wikidata',
            confidence: candidates.length === 0 ? 70 : 55,
        });
    };

    for (const lang of [ 'ru', 'en' ] as const) {
        const page = await loadWikiPage(lang, title);
        if (!page) continue;
        push(await buildMovie(lang, page));
    }

    for (const [ lang, query ] of buildLookupAttempts(title)) {
        const titles = await searchWiki(lang, query);
        for (const wikiTitle of titles.slice(0, 5)) {
            const page = await loadWikiPage(lang, wikiTitle);
            if (!page) continue;
            push(await buildMovie(lang, page));
            if (candidates.length >= 4) return candidates;
        }
    }

    return candidates;
}
```

- [ ] **Step 4: Add `lookupMovieCandidates`**

Replace the handler body in `src/server/movie-lookup.ts` with:

```ts
const lookupInputSchema = z.object({
    title: z.string().trim().min(2).max(200),
    kind: z.enum(movieKindOptions).optional(),
});

export const lookupMovieCandidates = createServerFn({ method: 'POST' })
    .validator(lookupInputSchema)
    .handler(async ({ data }) => {
        const { getAuthUser } = await import('./session');
        const user = await getAuthUser();
        if (!user) return { ok: false as const, error: 'Требуется авторизация' };

        const { lookupWikidataCandidates } = await import('./movie-lookup-providers/wikidata');
        const candidates = (await lookupWikidataCandidates(data.title))
            .map((candidate) => movieLookupCandidateSchema.parse(candidate))
            .slice(0, 8);

        if (!candidates.length) {
            return { ok: false as const, error: 'Не удалось найти данные. Заполните поля вручную.' };
        }

        return { ok: true as const, candidates };
    });

export const lookupMovie = createServerFn({ method: 'POST' })
    .validator(z.object({ title: z.string().trim().min(2).max(200) }))
    .handler(async ({ data }) => {
        const result = await lookupMovieCandidates({ data });
        if (!result.ok) return result;
        return { ok: true as const, movie: result.candidates[0] };
    });
```

- [ ] **Step 5: Run focused tests**

Run: `pnpm test:lookup`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/movie-lookup.ts src/server/movie-lookup-providers/wikidata.ts scripts/movie-lookup.test.ts
git commit -m "feat(lookup): return selectable metadata candidates"
```

---

### Task 3: Kinopoisk.dev Provider

**Files:**
- Create: `src/server/movie-lookup-providers/kinopoisk-dev.ts`
- Modify: `src/server/movie-lookup.ts`
- Modify: `scripts/movie-lookup.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `MovieLookupCandidate`.
- Produces:
  - `mapKinopoiskMovie(doc: KinopoiskMovie, episodesPerSeason?: number[]): MovieLookupCandidate | null`
  - `lookupKinopoiskCandidates(title: string, kind?: MovieKind): Promise<MovieLookupCandidate[]>`

- [ ] **Step 1: Write failing mapper tests**

Add to `scripts/movie-lookup.test.ts`:

```ts
import { mapKinopoiskMovie } from '../src/server/movie-lookup-providers/kinopoisk-dev';

test('kinopoisk mapper normalizes series metadata', () => {
    const candidate = mapKinopoiskMovie({
        id: 464963,
        type: 'tv-series',
        name: 'Игра престолов',
        alternativeName: 'Game of Thrones',
        year: 2011,
        description: 'Борьба за Железный трон.',
        shortDescription: null,
        movieLength: 55,
        rating: { kp: 9.0 },
        poster: { previewUrl: 'https://example.com/got.jpg', url: 'https://example.com/got-full.jpg' },
        countries: [ { name: 'США' }, { name: 'Великобритания' } ],
        genres: [ { name: 'драма' }, { name: 'фэнтези' } ],
        persons: [
            { name: 'Дэвид Бениофф', profession: 'режиссеры', enProfession: 'director' },
            { name: 'Питер Динклэйдж', profession: 'актеры', enProfession: 'actor' },
        ],
    }, [ 10, 10, 10, 10, 10, 10, 7, 6 ]);

    assert.equal(candidate?.provider, 'kinopoisk-dev');
    assert.equal(candidate?.kind, 'SERIES');
    assert.equal(candidate?.title, 'Игра престолов');
    assert.equal(candidate?.originalTitle, 'Game of Thrones');
    assert.equal(candidate?.country, 'США, Великобритания');
    assert.deepEqual(candidate?.episodesPerSeason, [ 10, 10, 10, 10, 10, 10, 7, 6 ]);
    assert.equal(candidate?.seasonsCount, 8);
    assert.equal(candidate?.sourceUrl, 'https://www.kinopoisk.ru/film/464963/');
});

test('kinopoisk mapper detects cartoons from type and genres', () => {
    const candidate = mapKinopoiskMovie({
        id: 1,
        type: 'cartoon',
        name: 'ВАЛЛ-И',
        alternativeName: 'WALL-E',
        year: 2008,
        genres: [ { name: 'мультфильм' }, { name: 'фантастика' } ],
        countries: [],
        persons: [],
    });

    assert.equal(candidate?.kind, 'CARTOON');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:lookup`

Expected: FAIL because `kinopoisk-dev.ts` does not exist.

- [ ] **Step 3: Implement mapper and API client**

Create `src/server/movie-lookup-providers/kinopoisk-dev.ts` with exported mapper plus private client functions:

```ts
import type { MovieKind } from '@/lib/movie-data';
import type { MovieLookupCandidate } from '@/lib/movie-lookup-types';

type KinopoiskName = { name?: string | null };
type KinopoiskPerson = {
    name?: string | null;
    profession?: string | null;
    enProfession?: string | null;
};
export type KinopoiskMovie = {
    id?: number | string | null;
    type?: string | null;
    name?: string | null;
    alternativeName?: string | null;
    enName?: string | null;
    year?: number | null;
    description?: string | null;
    shortDescription?: string | null;
    movieLength?: number | null;
    seriesLength?: number | null;
    rating?: { kp?: number | null; imdb?: number | null } | null;
    poster?: { previewUrl?: string | null; url?: string | null } | null;
    countries?: KinopoiskName[] | null;
    genres?: KinopoiskName[] | null;
    persons?: KinopoiskPerson[] | null;
};

function text(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function detectKind(movie: KinopoiskMovie): MovieKind {
    const type = text(movie.type).toLowerCase();
    const genres = movie.genres?.map((genre) => text(genre.name).toLowerCase()).join(' ') ?? '';
    if (type.includes('series') || type.includes('tv')) return 'SERIES';
    if (type.includes('cartoon') || genres.includes('мульт')) return 'CARTOON';
    return 'MOVIE';
}

export function mapKinopoiskMovie(
    movie: KinopoiskMovie,
    episodesPerSeason: number[] = [],
): MovieLookupCandidate | null {
    const title = text(movie.name) || text(movie.alternativeName) || text(movie.enName);
    if (!title) return null;

    const directorNames = movie.persons
        ?.filter((person) => text(person.enProfession) === 'director' || text(person.profession).includes('режисс'))
        .map((person) => text(person.name))
        .filter(Boolean)
        .slice(0, 2) ?? [];
    const actorNames = movie.persons
        ?.filter((person) => text(person.enProfession) === 'actor' || text(person.profession).includes('актер'))
        .map((person) => text(person.name))
        .filter(Boolean)
        .slice(0, 6) ?? [];

    return {
        found: true,
        provider: 'kinopoisk-dev',
        providerLabel: 'Кинопоиск',
        externalId: movie.id == null ? undefined : String(movie.id),
        sourceUrl: movie.id == null ? undefined : `https://www.kinopoisk.ru/film/${movie.id}/`,
        confidence: 90,
        rating: movie.rating?.kp ?? movie.rating?.imdb ?? null,
        kind: detectKind(movie),
        title,
        originalTitle: text(movie.alternativeName) || text(movie.enName) || null,
        year: movie.year ?? null,
        country: movie.countries?.map((item) => text(item.name)).filter(Boolean).slice(0, 4).join(', ') || null,
        description: text(movie.description) || text(movie.shortDescription) || null,
        director: directorNames.join(', ') || null,
        genres: movie.genres?.map((genre) => text(genre.name).toLowerCase()).filter(Boolean) ?? [],
        starring: actorNames,
        durationMin: movie.movieLength ?? movie.seriesLength ?? null,
        seasonsCount: episodesPerSeason.length || null,
        episodesPerSeason,
        posterUrl: movie.poster?.previewUrl ?? movie.poster?.url ?? null,
    };
}
```

Then add private fetch/search/season logic in the same file:

```ts
const DEFAULT_BASE_URL = 'https://api.kinopoisk.dev';

function getKinopoiskConfig() {
    const token = process.env.KINOPOISK_DEV_TOKEN?.trim();
    if (!token) return null;
    return {
        token,
        baseUrl: process.env.KINOPOISK_DEV_BASE_URL?.trim() || DEFAULT_BASE_URL,
    };
}

async function kinopoiskJson<T>(path: string, params: URLSearchParams): Promise<T | null> {
    const config = getKinopoiskConfig();
    if (!config) return null;
    const url = `${config.baseUrl}${path}?${params}`;
    const res = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: {
            accept: 'application/json',
            'X-API-KEY': config.token,
        },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
}

type KinopoiskSearchResponse = { docs?: KinopoiskMovie[] };
type KinopoiskSeasonResponse = {
    docs?: Array<{ number?: number | null; episodes?: unknown[] | null; episodesCount?: number | null }>;
};

async function loadEpisodesPerSeason(movieId: string) {
    const params = new URLSearchParams({
        movieId,
        limit: '50',
        sortField: 'number',
        sortType: '1',
    });
    const json = await kinopoiskJson<KinopoiskSeasonResponse>('/v1.4/season', params);
    return (json?.docs ?? [])
        .sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
        .map((season) => season.episodesCount ?? season.episodes?.length ?? 0)
        .filter((count) => count > 0);
}

export async function lookupKinopoiskCandidates(title: string, kind?: MovieKind): Promise<MovieLookupCandidate[]> {
    const params = new URLSearchParams({
        query: title,
        limit: '8',
    });
    const json = await kinopoiskJson<KinopoiskSearchResponse>('/v1.4/movie/search', params);
    const docs = json?.docs ?? [];
    const candidates: MovieLookupCandidate[] = [];

    for (const doc of docs) {
        const id = doc.id == null ? '' : String(doc.id);
        const baseCandidate = mapKinopoiskMovie(doc);
        if (!baseCandidate) continue;
        if (kind && baseCandidate.kind !== kind) continue;

        const episodesPerSeason = baseCandidate.kind === 'SERIES' && id
            ? await loadEpisodesPerSeason(id)
            : [];
        const candidate = mapKinopoiskMovie(doc, episodesPerSeason);
        if (candidate) candidates.push(candidate);
    }

    return candidates;
}
```

- [ ] **Step 4: Wire provider ordering**

Modify `src/server/movie-lookup.ts` handler:

```ts
const { lookupKinopoiskCandidates } = await import('./movie-lookup-providers/kinopoisk-dev');
const { lookupWikidataCandidates } = await import('./movie-lookup-providers/wikidata');

const [ kinopoiskCandidates, wikidataCandidates ] = await Promise.all([
    lookupKinopoiskCandidates(data.title, data.kind),
    lookupWikidataCandidates(data.title),
]);

const seen = new Set<string>();
const candidates = [ ...kinopoiskCandidates, ...wikidataCandidates ]
    .filter((candidate) => {
        const key = `${candidate.provider}:${candidate.externalId ?? candidate.title}:${candidate.year ?? ''}`.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    })
    .map((candidate) => movieLookupCandidateSchema.parse(candidate))
    .slice(0, 8);
```

- [ ] **Step 5: Document env**

Add to `.env.example`:

```bash
# Optional movie metadata provider.
# KINOPOISK_DEV_TOKEN="..."
# KINOPOISK_DEV_BASE_URL="https://api.kinopoisk.dev"
```

- [ ] **Step 6: Run focused tests**

Run: `pnpm test:lookup`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/movie-lookup.ts src/server/movie-lookup-providers/kinopoisk-dev.ts scripts/movie-lookup.test.ts .env.example
git commit -m "feat(lookup): add kinopoisk metadata provider"
```

---

### Task 4: Candidate Cards UI

**Files:**
- Create: `src/components/movies/LookupCandidates.tsx`
- Create: `scripts/movie-form-flow.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `MovieLookupCandidate`.
- Produces:
  - `LookupCandidates` React component.

- [ ] **Step 1: Write source-level UI test**

Create `scripts/movie-form-flow.test.ts`:

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(path: string) {
    return readFileSync(path, 'utf8');
}

test('lookup candidates render selectable source cards', () => {
    const source = read('src/components/movies/LookupCandidates.tsx');

    assert.match(source, /type LookupCandidatesProps/);
    assert.match(source, /MovieLookupCandidate/);
    assert.match(source, /providerLabel/);
    assert.match(source, /Заполнить/);
    assert.match(source, /Не подходит/);
    assert.match(source, /episodesPerSeason/);
});
```

Add to `package.json` scripts:

```json
"test:movie-form-flow": "tsx --test scripts/movie-form-flow.test.ts"
```

Add `pnpm test:movie-form-flow` into the aggregate `test` script.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:movie-form-flow`

Expected: FAIL because `LookupCandidates.tsx` does not exist.

- [ ] **Step 3: Implement component**

Create `src/components/movies/LookupCandidates.tsx`:

```tsx
import type { MovieLookupCandidate } from '@/lib/movie-lookup-types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type LookupCandidatesProps = {
    candidates: MovieLookupCandidate[];
    onSelect: (candidate: MovieLookupCandidate) => void;
    onReject: () => void;
};

function formatSeries(candidate: MovieLookupCandidate) {
    if (candidate.kind !== 'SERIES') return null;
    if (candidate.episodesPerSeason?.length) {
        return `${candidate.episodesPerSeason.length} сез., ${candidate.episodesPerSeason.reduce((sum, count) => sum + count, 0)} сер.`;
    }
    return candidate.seasonsCount ? `${candidate.seasonsCount} сез.` : null;
}

export function LookupCandidates({ candidates, onSelect, onReject }: LookupCandidatesProps) {
    if (!candidates.length) return null;

    return (
        <section className="flex flex-col gap-3" aria-label="Найденные варианты">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="text-sm font-semibold">Выберите источник данных</p>
                    <p className="text-xs text-muted-foreground">Форма заполнится только после выбора карточки.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={onReject}>
                    Не подходит
                </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                {candidates.map((candidate, index) => {
                    const series = formatSeries(candidate);
                    return (
                        <Card key={`${candidate.provider}-${candidate.externalId ?? index}`} className="py-3">
                            <CardContent className="flex gap-3 px-3">
                                <div className="h-28 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
                                    {candidate.posterUrl ? (
                                        <img src={candidate.posterUrl} alt="" className="h-full w-full object-cover"/>
                                    ) : null}
                                </div>
                                <div className="flex min-w-0 flex-1 flex-col gap-2">
                                    <div className="min-w-0">
                                        <div className="mb-1 inline-flex rounded bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                                            {candidate.providerLabel}
                                        </div>
                                        <p className="truncate text-sm font-semibold">{candidate.title}</p>
                                        {candidate.originalTitle ? (
                                            <p className="truncate text-xs text-muted-foreground">{candidate.originalTitle}</p>
                                        ) : null}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        {[ candidate.year, candidate.country, series, candidate.rating ? `kp ${candidate.rating}` : null ]
                                            .filter(Boolean)
                                            .join(' · ')}
                                    </p>
                                    {candidate.genres?.length ? (
                                        <p className="line-clamp-1 text-xs text-muted-foreground">{candidate.genres.join(', ')}</p>
                                    ) : null}
                                    {candidate.description ? (
                                        <p className="line-clamp-2 text-xs text-muted-foreground">{candidate.description}</p>
                                    ) : null}
                                    <Button type="button" size="sm" className="mt-auto self-start" onClick={() => onSelect(candidate)}>
                                        Заполнить
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </section>
    );
}
```

- [ ] **Step 4: Run focused test**

Run: `pnpm test:movie-form-flow`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/movies/LookupCandidates.tsx scripts/movie-form-flow.test.ts package.json
git commit -m "feat(movies): add lookup candidate cards"
```

---

### Task 5: Add/Edit Lookup Selection Flow

**Files:**
- Modify: `src/routes/movies/new.tsx`
- Modify: `src/routes/movies/$movieId_.edit.tsx`
- Modify: `scripts/movie-form-flow.test.ts`
- Modify: `scripts/movie-edit-header.test.ts`

**Interfaces:**
- Consumes: `lookupMovieCandidates`, `LookupCandidates`, `MovieLookupCandidate`.
- Produces:
  - `candidateToFormDefaults(candidate, fallbackTitle?)`
  - `mergeLookupDefaults(current, candidate)`

- [ ] **Step 1: Write route behavior tests**

Extend `scripts/movie-form-flow.test.ts`:

```ts
test('new movie page shows candidates before applying lookup data', () => {
    const source = read('src/routes/movies/new.tsx');

    assert.match(source, /lookupMovieCandidates/);
    assert.match(source, /LookupCandidates/);
    assert.match(source, /setLookupCandidates/);
    assert.match(source, /candidateToFormDefaults/);
    assert.doesNotMatch(source, /toast\.success\('Форма заполнена/);
});

test('movie edit page refresh shows candidates before merge', () => {
    const source = read('src/routes/movies/$movieId_.edit.tsx');

    assert.match(source, /lookupMovieCandidates/);
    assert.match(source, /LookupCandidates/);
    assert.match(source, /setLookupCandidates/);
    assert.match(source, /mergeLookupDefaults/);
    assert.doesNotMatch(source, /toast\.success\('Данные обновлены'\)/);
});
```

Update `scripts/movie-edit-header.test.ts` expectation from `/lookupMovie/` to `/lookupMovieCandidates/`.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm test:movie-form-flow
pnpm test:movie-edit-header
```

Expected: FAIL because routes still auto-apply single lookup result.

- [ ] **Step 3: Update new route**

In `src/routes/movies/new.tsx`:

```ts
import { LookupCandidates } from '@/components/movies/LookupCandidates';
import { lookupMovieCandidates } from '@/server/movie-lookup';
import type { MovieLookupCandidate } from '@/lib/movie-lookup-types';
```

Add helper:

```ts
function candidateToFormDefaults(
    candidate: MovieLookupCandidate,
    fallbackTitle: string,
): Partial<MovieFormFields> {
    return {
        kind: candidate.kind ?? 'MOVIE',
        title: candidate.title ?? fallbackTitle,
        year: candidate.year ?? new Date().getFullYear(),
        country: candidate.country ?? '',
        description: candidate.description ?? '',
        director: candidate.director ?? '',
        genres: normalizeGenreOptions(candidate.genres ?? []),
        starring: candidate.starring?.join(', ') ?? '',
        durationMin: candidate.durationMin ?? '',
        seasonsCount: candidate.seasonsCount ?? '',
        episodesPerSeason: candidate.episodesPerSeason?.join(', ') ?? '',
        posterUrl: candidate.posterUrl ?? '',
    };
}
```

Replace lookup state:

```ts
const [ lookupCandidates, setLookupCandidates ] = useState<MovieLookupCandidate[]>([]);
```

Replace `handleLookup` success path:

```ts
const result = await lookupMovieCandidates({ data: { title, kind } });
if (!result.ok) {
    toast.error(result.error);
    setLookupCandidates([]);
    return;
}
setLookupCandidates(result.candidates);
```

Render candidates between quick lookup and form:

```tsx
<LookupCandidates
    candidates={lookupCandidates}
    onReject={() => setLookupCandidates([])}
    onSelect={(candidate) => {
        setLookupDefaults(candidateToFormDefaults(candidate, lookupTitle.trim()));
        setLookupCandidates([]);
        toast.success('Данные подставлены — проверьте перед сохранением');
    }}
/>
```

- [ ] **Step 4: Update edit route**

In `src/routes/movies/$movieId_.edit.tsx`:

```ts
import { LookupCandidates } from '@/components/movies/LookupCandidates';
import { lookupMovieCandidates, type MovieLookupCandidate } from '@/server/movie-lookup';
```

Change `mergeLookupDefaults` argument type to `MovieLookupCandidate` and keep links intact:

```ts
function mergeLookupDefaults(
    current: Partial<MovieFormFields>,
    lookup: MovieLookupCandidate,
): Partial<MovieFormFields> {
    return {
        ...current,
        kind: lookup.kind ?? current.kind,
        title: lookup.title ?? current.title,
        year: lookup.year ?? current.year,
        country: lookup.country ?? current.country,
        description: lookup.description ?? current.description,
        posterUrl: current.posterUrl || lookup.posterUrl || '',
        trailerUrls: current.trailerUrls,
        watchLinks: current.watchLinks,
        director: lookup.director ?? current.director,
        genres: lookup.genres?.length ? normalizeGenreOptions(lookup.genres) : current.genres,
        starring: lookup.starring?.length ? lookup.starring.join(', ') : current.starring,
        durationMin: lookup.durationMin ?? current.durationMin,
        seasonsCount: lookup.seasonsCount ?? current.seasonsCount,
        episodesPerSeason: lookup.episodesPerSeason?.length
            ? lookup.episodesPerSeason.join(', ')
            : current.episodesPerSeason,
    };
}
```

Add state:

```ts
const [ lookupCandidates, setLookupCandidates ] = useState<MovieLookupCandidate[]>([]);
```

Replace refresh success path:

```ts
const result = await lookupMovieCandidates({ data: { title, kind: formDefaults.kind } });
if (!result.ok) {
    toast.error(result.error);
    setLookupCandidates([]);
    return;
}
setLookupCandidates(result.candidates);
```

Render candidates above form:

```tsx
<LookupCandidates
    candidates={lookupCandidates}
    onReject={() => setLookupCandidates([])}
    onSelect={(candidate) => {
        setFormDefaults((current) => mergeLookupDefaults(current, candidate));
        setLookupCandidates([]);
        setFormVersion((current) => current + 1);
        toast.success('Данные подставлены — проверьте перед сохранением');
    }}
/>
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
pnpm test:movie-form-flow
pnpm test:movie-edit-header
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/movies/new.tsx src/routes/movies/\$movieId_.edit.tsx scripts/movie-form-flow.test.ts scripts/movie-edit-header.test.ts
git commit -m "feat(movies): require selecting lookup results"
```

---

### Task 6: Persistent Form Footer

**Files:**
- Modify: `src/components/movies/MovieForm.tsx`
- Create: `src/components/movies/MovieFormFooter.tsx`
- Modify: `src/routes/movies/new.tsx`
- Modify: `src/routes/movies/$movieId_.edit.tsx`
- Modify: `scripts/movie-form-flow.test.ts`

**Interfaces:**
- Consumes: existing `MovieForm` submit behavior.
- Produces:
  - `MovieForm` props: `formId?: string`, `hideSubmitButton?: boolean`, `onSubmittingChange?: (isSubmitting: boolean) => void`
  - `MovieFormFooter({ formId, submitLabel, isSubmitting, cancelTo, onCancel? })`

- [ ] **Step 1: Write failing tests**

Add to `scripts/movie-form-flow.test.ts`:

```ts
test('movie form supports external sticky footer actions', () => {
    const form = read('src/components/movies/MovieForm.tsx');
    const footer = read('src/components/movies/MovieFormFooter.tsx');
    const newRoute = read('src/routes/movies/new.tsx');
    const editRoute = read('src/routes/movies/$movieId_.edit.tsx');

    assert.match(form, /formId\?: string/);
    assert.match(form, /hideSubmitButton\?: boolean/);
    assert.match(form, /onSubmittingChange/);
    assert.match(footer, /fixed bottom-0/);
    assert.match(footer, /Отмена/);
    assert.match(footer, /form=\{formId\}/);
    assert.match(newRoute, /MovieFormFooter/);
    assert.match(editRoute, /MovieFormFooter/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:movie-form-flow`

Expected: FAIL because `MovieFormFooter.tsx` does not exist.

- [ ] **Step 3: Update `MovieForm`**

Modify `MovieFormProps`:

```ts
type MovieFormProps = {
    defaults?: Partial<MovieFormFields>;
    submitLabel: string;
    onSubmit: (fields: MovieFormFields) => Promise<void>;
    formId?: string;
    hideSubmitButton?: boolean;
    onSubmittingChange?: (isSubmitting: boolean) => void;
};
```

Update component signature:

```ts
export function MovieForm({
    defaults,
    submitLabel,
    onSubmit,
    formId,
    hideSubmitButton,
    onSubmittingChange,
}: MovieFormProps) {
```

Add helper:

```ts
const setSubmitting = (value: boolean) => {
    setIsSubmitting(value);
    onSubmittingChange?.(value);
};
```

Replace `setIsSubmitting(true/false)` with `setSubmitting(true/false)`.

Add form id:

```tsx
<form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4">
```

Wrap internal button:

```tsx
{hideSubmitButton ? null : (
    <Button type="submit" disabled={isSubmitting} className="self-end">
        {isSubmitting ? 'Сохранение…' : submitLabel}
    </Button>
)}
```

- [ ] **Step 4: Add footer component**

Create `src/components/movies/MovieFormFooter.tsx`:

```tsx
import { Link } from '@tanstack/react-router';

import { Button } from '@/components/ui/button';

type MovieFormFooterProps = {
    formId: string;
    submitLabel: string;
    cancelTo: string;
    isSubmitting: boolean;
};

export function MovieFormFooter({ formId, submitLabel, cancelTo, isSubmitting }: MovieFormFooterProps) {
    return (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/70 bg-background/80 px-4 py-3 shadow-[0_-16px_36px_rgb(0_0_0/0.28)] backdrop-blur-md [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))] md:left-60">
            <div className="mx-auto flex w-full max-w-3xl items-center justify-end gap-2">
                <Button asChild type="button" variant="outline">
                    <Link to={cancelTo}>Отмена</Link>
                </Button>
                <Button type="submit" form={formId} disabled={isSubmitting}>
                    {isSubmitting ? 'Сохранение…' : submitLabel}
                </Button>
            </div>
        </div>
    );
}
```

- [ ] **Step 5: Integrate footer in add/edit**

In `new.tsx`:

```ts
const formId = 'new-movie-form';
const [ isSubmitting, setIsSubmitting ] = useState(false);
```

Use:

```tsx
<div className="mx-auto flex w-full max-w-2xl flex-col gap-6 pb-28">
```

Pass props:

```tsx
<MovieForm
    formId={formId}
    hideSubmitButton
    onSubmittingChange={setIsSubmitting}
    ...
/>
<MovieFormFooter
    formId={formId}
    submitLabel="Добавить фильм"
    cancelTo="/"
    isSubmitting={isSubmitting}
/>
```

In edit route, use `formId = 'edit-movie-form'`, `cancelTo={`/movies/${movie.id}`}`, and `submitLabel="Сохранить"`.

- [ ] **Step 6: Run focused tests**

Run: `pnpm test:movie-form-flow`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/movies/MovieForm.tsx src/components/movies/MovieFormFooter.tsx src/routes/movies/new.tsx src/routes/movies/\$movieId_.edit.tsx scripts/movie-form-flow.test.ts
git commit -m "feat(movies): keep form actions in sticky footer"
```

---

### Task 7: Docs, Verification, Push, Deploy

**Files:**
- Modify: `AGENTS.md`
- Modify: `src/server/AGENTS.md`
- Modify: `src/routes/AGENTS.md`

**Interfaces:**
- Consumes: completed Tasks 1-6.
- Produces: updated handoff context and deployed production build.

- [ ] **Step 1: Update docs**

In `AGENTS.md`, replace the movie lookup line:

```md
`movie-lookup.ts` получает данные из Wikipedia/Wikidata без токенов.
```

with:

```md
`movie-lookup.ts` получает кандидатов из `kinopoisk.dev`, если задан `KINOPOISK_DEV_TOKEN`, и из Wikipedia/Wikidata как fallback.
```

In `src/server/AGENTS.md`, update `movie-lookup.ts` module description to mention `lookupMovieCandidates` and provider modules.

In `src/routes/AGENTS.md`, update edit route note to mention candidate cards before applying metadata and sticky bottom form footer.

- [ ] **Step 2: Run full verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 3: Commit docs**

```bash
git add AGENTS.md src/server/AGENTS.md src/routes/AGENTS.md package.json
git commit -m "docs(movies): document lookup providers"
```

If `package.json` was already committed in Task 4 and unchanged here, omit it from `git add`.

- [ ] **Step 4: Push**

Run:

```bash
git status --short --branch
git push origin main
```

Expected: branch is clean before push except no untracked files; push updates `origin/main`.

- [ ] **Step 5: Deploy**

Run:

```bash
/Users/ayurash/Development/_Projects/ayurash-infra/scripts/deploy-app-source.sh ay-movies /Users/ayurash/Development/_Projects/ay-movies
ssh -o BatchMode=yes deploy@72.56.8.147 'cd /opt/ayurash && docker compose up -d --build ay-movies'
ssh -o BatchMode=yes deploy@72.56.8.147 'cd /opt/ayurash && docker compose ps ay-movies'
curl -I --max-time 20 https://movies.ayurash.ru
```

Expected: compose service is `Up`, and curl returns HTTP 200 or 3xx.

---

## Self-Review

- Spec coverage: provider abstraction, Kinopoisk token handling, candidate selection UI, no auto-fill before selection, sticky footer, docs, tests, commit/push/deploy are covered.
- Placeholder scan: no placeholder markers or deferred implementation steps remain.
- Type consistency: `MovieLookupCandidate`, `lookupMovieCandidates`, `LookupCandidates`, and `MovieFormFooter` names are consistent across tasks.
