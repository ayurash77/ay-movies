# AGENTS.md

Контекст для Codex/Claude при работе с AY Movies. Отвечай пользователю по-русски, коротко и по делу.

## Рабочий процесс

- После законченной задачи делай осмысленный коммит и `git push origin main`, если пользователь явно не сказал иначе.
- Не трогай `.env` и секреты. Env живет в `.env`, пример в `.env.example`.
- Перед изменениями смотри текущие паттерны в коде. Не делай широкие рефакторы без необходимости.
- Если меняешь Prisma schema, создавай миграцию через `pnpm db:migrate:dev`; bare `db:push` использовать только для локальных экспериментов.

## Команды

```bash
pnpm dev             # dev server, порт 3002
pnpm build           # production build
pnpm typecheck       # tsc --noEmit

pnpm dc:up           # PostgreSQL 18 в Docker, host port 5434
pnpm dc:down         # остановить Docker Compose
pnpm db:migrate:dev  # создать и применить миграцию
pnpm db:generate     # regenerate Prisma client
pnpm db:seed         # очистить и пересоздать demo data
pnpm db:studio       # Prisma Studio
```

Демо-пароль после seed: `demo123`. Demo users включают `demo@ay-movies.dev` и администратора `ayurash@me.com`.

## Деплой

Production: `https://movies.ayurash.ru` на общем Timeweb VDS. Исходники лежат
в `/opt/ayurash/apps/ay-movies`, Compose service — `ay-movies`, host port `3102`
за Caddy. PostgreSQL database `ay_movies` работает в service `postgres` того же
Compose project; при старте контейнера выполняется `prisma migrate deploy`.
Загрузки остаются в Timeweb S3, базы и конфигурация ежедневно сохраняются в
зашифрованный restic backup. `movienest.ru` — только legacy redirect.

Runtime env: `/opt/ayurash/env/ay-movies.env`. Нужны `DATABASE_URL`,
`SESSION_SECRET`, `WEB_ALLOWED_HOSTS` и `S3_*`. OpenAI не используется:
`movie-lookup.ts` получает кандидатов из `kinopoisk.dev`, если задан
`KINOPOISK_DEV_TOKEN`, из `kinopoiskapiunofficial.tech`, если задан
`KINOPOISK_UNOFFICIAL_TOKEN`, и из Wikipedia/Wikidata как fallback.

## Архитектура

Единое full-stack приложение TanStack Start. Отдельного API-сервера нет. Клиент вызывает server functions из `src/server/*`, а Start компилирует их в RPC.

Основные зоны:
- `src/routes/` — file-based routes, layout, страницы и route handlers.
- `src/server/` — server functions, DB, auth, uploads, notifications, chat.
- `src/components/` — общие UI-компоненты, sidebar, profile/theme dialogs, movie UI.
- `src/lib/` — типы/хелперы без прямого доступа к cookie/DB, кроме `src/lib/db.ts`.
- `prisma/schema.prisma` и `prisma/migrations/` — база.

Функции приложения:
- Каталог фильмов/сериалов/мультфильмов с пагинацией, поиском, сортировкой, фильтрами и группировками по происхождению, странам и жанрам.
- Карточки, страницы деталей, несколько ссылок на трейлеры, ссылки "где смотреть", рейтинги 1-5, комментарии, watch list.
- Роли `USER`/`ADMIN`; `ayurash@me.com` всегда admin через `resolveRole`.
- Dashboard: admin-only администрирование пользователей. Друзья живут на отдельной странице `/friends` из меню пользователя.
- Профиль в диалоге, аватар пользователя, admin badge.
- Друзья, подписки, уведомления о новых фильмах, комментариях и сообщениях.
- Чат: закрепленный общий чат, личные диалоги с друзьями, polling, unread counters, ответы, фото, context menu, редактирование/удаление своих сообщений; admin может управлять любыми видимыми сообщениями.
- Темы оформления из `src/lib/theme.ts`; default `ayu`.

## Server-only и import protection

Главная ловушка проекта: модули, импортируемые компонентами/роутами на клиенте, не должны тащить server-only код на верхнем уровне.

Правила:
- `src/server/session.ts`, `src/server/password.ts`, `src/lib/db.ts`, node modules вроде `node:crypto` и Prisma должны попадать в клиентские импорты только внутри `createServerFn().handler(...)` или server route handlers.
- Не делай top-level helper `getAuthUser()` в server-модуле, который сам импортируется UI. Импортируй `./session` внутри handler.
- Type-only imports допустимы: `import type { PrismaClient } from '@prisma/client'`.
- После сомнительных изменений запускай `pnpm build`, потому что `pnpm typecheck` такие ошибки не ловит.

## Uploads и S3

`src/server/storage.ts` выбирает backend:
- S3, если заданы `S3_*`.
- Local `uploads/<subdir>/` в dev.

Важно: `storeUpload()` возвращает same-origin URL `/uploads/<subdir>/<file>`, а не прямой S3 URL. Routes `uploads.posters.$file`, `uploads.avatars.$file`, `uploads.chat.$file` сначала пробуют локальный файл, затем при `storageDriver === 's3'` проксируют объект из S3 с cache/range headers. `toServedUploadUrl()` нормализует старые прямые S3 URL в `/uploads/...`.

## UI/Layout заметки

- Заголовки страниц задаются через `<PageTitle />`; текст рендерится в header из `src/routes/__root.tsx`.
- В header основных страниц каталога есть залитая icon-only кнопка `+`; высота должна совпадать с `Button size="sm"` в sidebar (`h-8`), без текста.
- В sidebar верхняя навигация: Фильмотека, Фильмы, Сериалы, Мультфильмы, Чат, Уведомления, затем "Мои списки". `Добавить` находится в нижнем блоке над `Оформление`, между ними разделитель.
- `/chat` имеет специальный layout: root фиксируется `h-svh overflow-hidden`, скроллится только список сообщений, composer закреплен снизу внутри chat section.
- В `/chat` общий чат идет первым; `/chat` без query на desktop показывает общий чат, а на mobile оставляет список видимым до явного выбора thread/user.
- Автоскролл чата должен скроллить сам messages container до `scrollHeight`, а не использовать marker `scrollIntoView`, иначе последние сообщения визуально уходят под composer.
- На мобильных sidebar открывается через sheet; не возвращай autofocus поиска при открытии.
- Визуальный стиль: компактные радиусы, сильные тени у карточек/header, тематические цвета, Tailwind 4 scrollbar colors.

## Handoff checklist

Перед передачей работы в другой чат:
- `git status --short` и список незакоммиченных файлов.
- Что изменено и почему.
- Какие проверки прошли (`pnpm typecheck`, `pnpm build`, миграции).
- Есть ли открытые риски: Prisma warning в client build, миграции, deploy env, S3/CORS, mobile layout.
