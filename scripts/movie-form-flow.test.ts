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
