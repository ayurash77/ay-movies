import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(path: string) {
    return readFileSync(path, 'utf8');
}

test('catalog routes send genre to server and render counter from page total', () => {
    const movieData = read('src/lib/movie-data.ts');
    const serverMovies = read('src/server/movies.ts');
    const home = read('src/routes/index.tsx');
    const movies = read('src/routes/movies/index.tsx');

    assert.match(movieData, /genre\?: string/);
    assert.match(serverMovies, /genre: z\.string\(\)\.trim\(\)\.max\(80\)\.optional\(\)/);
    assert.match(serverMovies, /genreSearchTerms\(data\.genre\)/);

    for (const source of [ home, movies ]) {
        assert.match(source, /loaderDeps: \(\{ search \}\) => \(\{[^}]*genre: search\.genre/s);
        assert.match(source, /genreCount = selectedGenre \? page\.total : null/);
        assert.doesNotMatch(source, /genreCount \?\? '\.\.\.'/);
    }
});

test('movie cards preserve the current catalog URL for detail back navigation', () => {
    const card = read('src/components/movies/MovieCard.tsx');
    const detail = read('src/routes/movies/$movieId.tsx');

    assert.match(card, /useLocation/);
    assert.match(card, /search=\{\{ from: currentPath \}\}/);
    assert.match(detail, /from: z\.string\(\)\.optional\(\)/);
    assert.match(detail, /backTo = safeReturnPath\(from\)/);
    assert.doesNotMatch(detail, /<Link to="\/">\s*<ArrowLeft/s);
});

test('series detail page has compact about and seasons tabs', () => {
    const detail = read('src/routes/movies/$movieId.tsx');
    const seasons = read('src/components/movies/SeriesSeasons.tsx');

    assert.match(detail, /Tabs/);
    assert.match(detail, /О сериале/);
    assert.match(detail, /Сезоны и серии/);
    assert.match(detail, /<SeriesSeasons movie=\{movie\}\/>/);
    assert.doesNotMatch(detail, /function seasonEpisodes/);

    assert.match(seasons, /overflow-x-auto/);
    assert.match(seasons, /size-10/);
    assert.match(seasons, /aria-pressed/);
    assert.match(seasons, /Intl\.DateTimeFormat\('ru-RU'/);
    assert.match(seasons, /originalName/);
    assert.match(seasons, /description/);
    assert.match(seasons, /stillUrl/);
    assert.match(seasons, /Серия \$\{number\}/);
    assert.doesNotMatch(seasons, /key=\{season\.number\}/);
    assert.doesNotMatch(seasons, /key=\{episode\.number\}/);
    assert.doesNotMatch(seasons, /activeSeasonNumber/);
    assert.doesNotMatch(seasons, /season\.number === activeSeason/);
    assert.match(seasons, /activeSeasonId/);
    assert.match(seasons, /season\.id === activeSeasonId/);
    assert.match(seasons, /function seasonContentFingerprint/);
    assert.doesNotMatch(seasons, /id: `season-\$\{(?:season\.)?number\}-\$\{seasonIndex\}`/);
});

test('app header relies on backdrop instead of a bottom border line', () => {
    const root = read('src/routes/__root.tsx');

    assert.doesNotMatch(root, /border-b border-border/);
    assert.match(root, /data-app-header-backdrop-tint/);
});
