# Chat UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pinned global chat, obvious direct-chat start flow, and message context menu while preserving existing chat features.

**Architecture:** Extend `ChatThread` with a lightweight kind/title model. Server functions create/return the global thread and expose friend starters. The existing `/chat` route keeps its layout and gains list controls plus a custom message context menu.

**Tech Stack:** TanStack Start, React, Prisma, PostgreSQL, Vitest, Tailwind, existing shadcn/Radix-style local UI components.

## Global Constraints

- Общий чат `Общий чат` закреплен первым пунктом списка.
- `/chat` без параметров открывает общий чат.
- Direct chat остается доступен только друзьям.
- Для общего чата не создавать персональные уведомления всем участникам.
- Сохранять текущие возможности: текст, фото, ответ, редактирование, удаление, mobile layout, fixed composer.
- После реализации выполнить `pnpm test`, `pnpm typecheck`, `pnpm build`, commit, push, deploy.

---

### Task 1: Chat server model and tests

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_global_chat_thread/migration.sql`
- Modify: `src/server/chat.ts`
- Create/modify: `src/server/chat.test.ts` if current test setup supports it

**Interfaces:**
- Produces `ChatThreadSummary.kind: 'DIRECT' | 'GLOBAL'`
- Produces `ChatThreadSummary.title: string`
- Produces `ChatPageData.startUsers: ChatUser[]`
- Keeps `sendChatMessage({ threadId, userId, text, replyToId, imageUrl })`

- [ ] **Step 1: Write failing tests**

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const chatSource = readFileSync('src/server/chat.ts', 'utf8');
const schemaSource = readFileSync('prisma/schema.prisma', 'utf8');

test('chat server creates a typed global thread and exposes start users', () => {
  assert.match(schemaSource, /kind\\s+String\\s+@default\\("DIRECT"\\)/);
  assert.match(schemaSource, /title\\s+String\\?/);
  assert.match(chatSource, /const GLOBAL_CHAT_TITLE = 'Общий чат'/);
  assert.match(chatSource, /async function getOrCreateGlobalThread/);
  assert.match(chatSource, /async function getChatStartUsers/);
});

test('global chat is pinned and opened by default without direct notifications', () => {
  assert.match(chatSource, /kind: 'GLOBAL'/);
  assert.match(chatSource, /activeThreadId = globalThreadId/);
  assert.match(chatSource, /thread.kind !== 'GLOBAL'/);
});
```

- [ ] **Step 2: Run red test**

Run: `pnpm test:chat-server`
Expected: FAIL because global chat helpers and `startUsers` are not implemented.

- [ ] **Step 3: Implement minimal server changes**

Add `kind`/`title` to Prisma schema and migration. Update `getChatPageData`, `mapThreads`, `sendChatMessage`, `getUnreadChatCount`, and `markRead` so the global thread is available, readable/writable by registered users, and does not fan out notifications.

- [ ] **Step 4: Run green test**

Run: `pnpm test:chat-server`
Expected: PASS.

### Task 2: Chat list and direct start UI

**Files:**
- Modify: `src/routes/chat.tsx`

**Interfaces:**
- Consumes `ChatPageData.startUsers`
- Consumes `ChatThreadSummary.kind` and `title`

- [ ] **Step 1: Write failing UI source test**

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('src/routes/chat.tsx', 'utf8');

test('chat page renders global chat and direct-dialog start affordance', () => {
  assert.match(source, /Общий чат/);
  assert.match(source, /startUsers/);
  assert.match(source, /Новый диалог/);
});
```

- [ ] **Step 2: Run red test**

Run: `pnpm test:chat-ui`
Expected: FAIL because the route has no global/start-dialog UI.

- [ ] **Step 3: Implement UI**

Add a list search state, render global chat via existing `ThreadButton`, render a compact “Новый диалог” search/list from `startUsers`, and navigate to `/chat?user=<id>` on selection.

- [ ] **Step 4: Run green test**

Run: `pnpm test:chat-ui`
Expected: PASS.

### Task 3: Message context menu

**Files:**
- Modify: `src/routes/chat.tsx`

**Interfaces:**
- Consumes existing handlers `handleReply`, `handleEdit`, `handleDelete`

- [ ] **Step 1: Extend failing UI source test**

```ts
assert.match(source, /onContextMenu/);
assert.match(source, /Копировать/);
assert.match(source, /navigator\\.clipboard\\.writeText/);
```

- [ ] **Step 2: Run red test**

Run: `pnpm test:chat-ui`
Expected: FAIL because message context menu is missing.

- [ ] **Step 3: Implement custom context menu**

Add controlled fixed-position menu opened from message bubble right click. Include reply, copy, edit, delete, close on click/Escape, and keep existing quick actions as fallback.

- [ ] **Step 4: Run green test**

Run: `pnpm test:chat-ui`
Expected: PASS.

### Task 4: Full verification, commit, push, deploy

**Files:**
- Verify all changed files

- [ ] **Step 1: Run verification**

```bash
pnpm test
pnpm typecheck
pnpm build
```

- [ ] **Step 2: Commit and push**

```bash
git status --short
git add package.json prisma/schema.prisma prisma/migrations src/server/chat.ts src/routes/chat.tsx scripts/chat-server.test.ts scripts/chat-ui.test.ts docs/superpowers/plans/2026-08-18-chat-ux-implementation.md
git commit -m "feat(chat): add global chat and message menu"
git push origin main
```

- [ ] **Step 3: Deploy**

```bash
/Users/ayurash/Development/_Projects/ayurash-infra/scripts/deploy-app-source.sh ay-movies /Users/ayurash/Development/_Projects/ay-movies
ssh -o BatchMode=yes deploy@72.56.8.147 'cd /opt/ayurash && docker compose up -d --build ay-movies'
```
