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
