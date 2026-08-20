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
