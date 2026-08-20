import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(path: string) {
    return readFileSync(path, 'utf8');
}

test('app header supports a second toolbar row with a shotmate-style backdrop', () => {
    const appTitle = read('src/components/AppTitle.tsx');
    const root = read('src/routes/__root.tsx');

    assert.match(appTitle, /toolbar: ReactNode \| null/);
    assert.match(root, /data-app-header-backdrop-blur/);
    assert.match(root, /data-app-header-toolbar/);
});

test('catalog gallery persists grouping and drives genre pages through header state', () => {
    const gallery = read('src/components/movies/MovieGallery.tsx');

    assert.match(gallery, /readCatalogPreferences/);
    assert.match(gallery, /storeCatalogPreferences/);
    assert.match(gallery, /selectedGenre/);
    assert.match(gallery, /onSelectedGenreChange/);
    assert.doesNotMatch(gallery, />\s*Все жанры\s*</);
});

test('catalog routes keep sort preferences and expose genre breadcrumbs', () => {
    const home = read('src/routes/index.tsx');
    const movies = read('src/routes/movies/index.tsx');

    for (const source of [ home, movies ]) {
        assert.match(source, /genre: z\.string\(\)\.optional\(\)/);
        assert.match(source, /readCatalogPreferences/);
        assert.match(source, /storeCatalogPreferences/);
        assert.match(source, /genreCount/);
    }
});
