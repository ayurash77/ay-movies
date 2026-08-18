import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const chatSource = readFileSync('src/server/chat.ts', 'utf8');
const schemaSource = readFileSync('prisma/schema.prisma', 'utf8');

test('chat server creates a typed global thread and exposes start users', () => {
    assert.match(schemaSource, /kind\s+String\s+@default\("DIRECT"\)/);
    assert.match(schemaSource, /title\s+String\?/);
    assert.match(chatSource, /const GLOBAL_CHAT_TITLE = 'Общий чат'/);
    assert.match(chatSource, /async function getOrCreateGlobalThread/);
    assert.match(chatSource, /async function getChatStartUsers/);
});

test('global chat is pinned and opened by default without direct notifications', () => {
    assert.match(chatSource, /kind: 'GLOBAL'/);
    assert.match(chatSource, /activeThreadId = globalThreadId/);
    assert.match(chatSource, /thread.kind !== 'GLOBAL'/);
});
