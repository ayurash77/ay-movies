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
    assert.match(source, /loadingCandidateKey/);
    assert.match(source, /const isBusy = Boolean\(loadingCandidateKey\)/);
    assert.match(source, /onClick=\{onReject\}[\s\S]*disabled=\{isBusy\}/);
    assert.match(source, /onClick=\{\(\) => onSelect\(candidate\)\}[\s\S]*disabled=\{isBusy\}/);
    assert.match(source, /Загрузка/);
});

test('new movie page shows candidates before applying lookup data', () => {
    const source = read('src/routes/movies/new.tsx');

    assert.match(source, /lookupMovieCandidates/);
    assert.match(source, /LookupCandidates/);
    assert.match(source, /setLookupCandidates/);
    assert.match(source, /candidateToFormDefaults/);
    assert.match(source, /loadMovieLookupDetails/);
    assert.match(source, /applyLookupCandidate/);
    assert.match(source, /metadataProvider/);
    assert.match(source, /metadataExternalId/);
    assert.match(source, /seriesSeasons/);
    assert.match(source, /useRef/);
    assert.match(source, /requestGeneration/);
    assert.match(source, /applyingCandidateRef/);
    assert.match(source, /submitImportedSeriesSnapshot/);
    assert.match(source, /metadataImportSucceeded/);
    assert.match(source, /setLookupCandidates\(\[\]\);[\s\S]*lookupMovieCandidates/);
    assert.match(source, /if \(applyingCandidateRef\.current \|\| lookingUpRef\.current\) return/);
    assert.match(source, /disabled=\{isLookingUp \|\| isApplyingCandidate/);
    assert.doesNotMatch(source, /toast\.success\('Форма заполнена/);
});

test('movie edit page refresh shows candidates before merge', () => {
    const source = read('src/routes/movies/$movieId_.edit.tsx');

    assert.match(source, /lookupMovieCandidates/);
    assert.match(source, /LookupCandidates/);
    assert.match(source, /setLookupCandidates/);
    assert.match(source, /mergeLookupDefaults/);
    assert.match(source, /loadMovieLookupDetails/);
    assert.match(source, /applyLookupCandidate/);
    assert.match(source, /movie\.metadataProvider/);
    assert.match(source, /movie\.metadataExternalId/);
    assert.match(source, /seriesSeasons/);
    assert.match(source, /useRef/);
    assert.match(source, /requestGeneration/);
    assert.match(source, /applyingCandidateRef/);
    assert.match(source, /submitImportedSeriesSnapshot/);
    assert.match(source, /metadataImportSucceeded/);
    assert.match(source, /disabled=\{isRefreshing \|\| isApplyingCandidate\}/);
    assert.doesNotMatch(source, /toast\.success\('Данные обновлены'\)/);
});

test('movie form keeps imported series data without manual season inputs', () => {
    const form = read('src/components/movies/MovieForm.tsx');

    assert.doesNotMatch(form, /name="seasonsCount"/);
    assert.doesNotMatch(form, /name="episodesPerSeason"/);
    assert.match(form, /seasonsCount: defaults\?\.seasonsCount/);
    assert.match(form, /episodesPerSeason: defaults\?\.episodesPerSeason/);
    assert.match(form, /metadataProvider: defaults\?\.metadataProvider/);
    assert.match(form, /metadataExternalId: defaults\?\.metadataExternalId/);
    assert.match(form, /submitImportedSeriesSnapshot\?: boolean/);
    assert.match(form, /seriesSeasons: submitImportedSeriesSnapshot \? defaults\?\.seriesSeasons : undefined/);
    assert.match(form, /metadataImportSucceeded\?: boolean/);
    assert.match(form, /metadataImportSucceeded,/);
    assert.match(form, /submitDisabled\?: boolean/);
    assert.match(form, /if \(submitDisabled\) return/);
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
    assert.match(footer, /disabled\?: boolean/);
    assert.match(footer, /disabled=\{isSubmitting \|\| disabled\}/);
    assert.match(newRoute, /MovieFormFooter/);
    assert.match(editRoute, /MovieFormFooter/);
    assert.match(newRoute, /disabled=\{isApplyingCandidate\}/);
    assert.match(editRoute, /disabled=\{isApplyingCandidate\}/);
});
