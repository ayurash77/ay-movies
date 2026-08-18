import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('src/routes/chat.tsx', 'utf8');

test('chat page renders global chat and direct-dialog start affordance', () => {
    assert.match(source, /Общий чат/);
    assert.match(source, /startUsers/);
    assert.match(source, /Новый диалог/);
});

test('chat page opens a message context menu with copy action', () => {
    assert.match(source, /onContextMenu/);
    assert.match(source, /Копировать/);
    assert.match(source, /navigator\.clipboard\.writeText/);
});
