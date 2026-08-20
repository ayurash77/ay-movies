import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(path: string) {
    return readFileSync(path, 'utf8');
}

test('app header supports page-specific leading and action buttons', () => {
    const appTitle = read('src/components/AppTitle.tsx');
    const root = read('src/routes/__root.tsx');

    assert.match(appTitle, /leading\?: ReactNode/);
    assert.match(appTitle, /actions\?: ReactNode/);
    assert.match(root, /appTitle\?\.leading/);
    assert.match(root, /appTitle\?\.actions/);
});

test('movie detail moves back and edit controls into the app header', () => {
    const detail = read('src/routes/movies/$movieId.tsx');

    assert.match(detail, /PageTitle[\s\S]*leading=/);
    assert.match(detail, /PageTitle[\s\S]*actions=/);
    assert.match(detail, /aria-label="Назад"/);
    assert.match(detail, /aria-label="Редактировать"/);
    assert.doesNotMatch(detail, /<div className="flex items-center justify-between">/);
});

test('movie edit page is unframed and can refresh metadata', () => {
    const edit = read('src/routes/movies/$movieId_.edit.tsx');

    assert.doesNotMatch(edit, /Card/);
    assert.match(edit, /lookupMovie/);
    assert.match(edit, /Обновить данные/);
    assert.match(edit, /mergeLookupDefaults/);
    assert.match(edit, /formVersion/);
});
