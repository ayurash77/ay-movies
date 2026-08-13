# AY Movies

AY Movies — full-stack веб-библиотека фильмов, сериалов и мультфильмов.

Возможности:
- каталог с пагинацией, поиском, сортировкой, фильтрами и группировками;
- страницы фильмов/сериалов/мультфильмов с постерами, трейлерами, рейтингами, комментариями и списками просмотра;
- роли `USER`/`ADMIN`, admin Dashboard, друзья, подписки и профили с аватарами;
- уведомления о новых фильмах, комментариях и сообщениях;
- чат с друзьями: ответы, фото, редактирование/удаление сообщений;
- темы оформления, default theme — Ayu;
- загрузки через local storage в dev и S3-compatible Timeweb storage в production.

## Стек

- TanStack Start, React 19, TanStack Router, server functions.
- PostgreSQL 18 + Prisma.
- Tailwind CSS 4, Radix/shadcn-style primitives.
- Email/password auth: scrypt hash, DB sessions, httpOnly cookie.
- Общий Timeweb VDS + Caddy + S3-compatible object storage.

## Запуск

```bash
cp .env.example .env
pnpm install
pnpm dc:up
pnpm db:migrate:dev
pnpm db:seed
pnpm dev
```

Dev server: `http://localhost:3002`.

Демо-пользователи после seed:
- `demo@ay-movies.dev` / `demo123`
- `ayurash@me.com` / `demo123` — admin
- `anna@ay-movies.dev`, `boris@ay-movies.dev`, `vera@ay-movies.dev`, `gleb@ay-movies.dev`, `dasha@ay-movies.dev` / `demo123`

## Команды

```bash
pnpm dev             # dev server, порт 3002
pnpm build           # production build
pnpm preview         # preview собранного приложения
pnpm typecheck       # tsc --noEmit

pnpm dc:up           # старт PostgreSQL в Docker, host port 5434
pnpm dc:down         # остановить Docker Compose

pnpm db:migrate:dev  # создать и применить миграцию
pnpm db:generate     # regenerate Prisma client
pnpm db:studio       # Prisma Studio
pnpm db:seed         # очистить и пересоздать demo data
pnpm db:push         # dev-only sync без миграции, не использовать для production flow
```

## Продакшен

- Канонический адрес: `https://movies.ayurash.ru`.
- `movienest.ru` сохранён только как постоянный redirect.
- Общий Timeweb VDS: `/opt/ayurash`, исходники в
  `/opt/ayurash/apps/ay-movies`, Compose service `ay-movies`, host port `3102`.
- Caddy обслуживает HTTPS; PostgreSQL database `ay_movies` работает на том же VDS.
- Контейнер применяет `prisma migrate deploy` при старте.
- Постеры, аватары и фото чата хранятся в действующем Timeweb S3; route handlers
  проксируют их через same-origin `/uploads/<subdir>/<file>`.
- Базы и production-конфигурация ежедневно сохраняются в зашифрованный restic backup.

Деплой выполняется через репозиторий `ayurash-infra`:

```bash
./scripts/deploy-app-source.sh ay-movies /path/to/ay-movies
ssh deploy@72.56.8.147 \
  'cd /opt/ayurash && docker compose up -d --build ay-movies'
```

Runtime env хранится только на VDS в `/opt/ayurash/env/ay-movies.env` и содержит
`DATABASE_URL`, `SESSION_SECRET`, `WEB_ALLOWED_HOSTS` и `S3_*`. Автозаполнение
карточки использует Wikipedia/Wikidata без OpenAI и без API-токенов.

## Архитектура

Единое TanStack Start приложение без отдельного API-сервера. Все операции с БД идут через `createServerFn` в `src/server`.

```text
src/
  routes/
    __root.tsx              app shell, header, sidebar, profile/theme dialogs
    index.tsx               общая Фильмотека
    movies/index.tsx        Фильмы / Сериалы / Мультфильмы
    movies/$movieId.tsx     детали, рейтинг, комментарии, watch buttons
    movies/$movieId_.edit   редактирование записи
    movies/new.tsx          добавление записи
    dashboard.index.tsx     admin Dashboard: пользователи и роли
    dashboard.$userId.tsx   профиль пользователя для dashboard/admin
    friends.tsx             друзья: список, добавление, чат, удаление
    chat.tsx                чат с друзьями
    notifications.tsx       уведомления
    my.tsx                  мои списки
    profile.tsx             legacy/profile page
    settings.tsx            настройки аккаунта
    uploads.*.$file.tsx     local/S3 proxy для posters, avatars, chat

  server/
    auth.ts                 auth server functions
    session.ts              server-only sessions/cookies
    movies.ts               каталог, поиск, CRUD, ratings, watch lists
    movie-lookup.ts         no-token lookup через Wikipedia/Wikidata
    dashboard.ts            users, friends, followers, roles
    notifications.ts        создание/list/read уведомлений
    chat.ts                 direct chat, unread counters, replies/images/edit/delete
    profile.ts              profile/avatar/password
    uploads.ts              poster upload
    storage.ts              local/S3 storage abstraction
    sidebar.ts              счетчики меню

  components/
    Sidebar.tsx             навигация и счетчики
    ProfileDialog.tsx       профиль в диалоге
    ThemeDialog.tsx         темы оформления
    movies/                 карточки, галерея, формы, рейтинги
    ui/                     локальные shadcn-style primitives

  lib/
    db.ts                   PrismaClient singleton
    theme.ts                темы и localStorage
    user-roles.ts           bootstrap admin
    upload-url.ts           normalization старых S3 URL

prisma/
  schema.prisma
  migrations/
  seed.ts
```

## Данные и права

- `Movie.kind`: `MOVIE`, `SERIES`, `CARTOON`.
- У сериалов есть `seasonsCount` и `episodesPerSeason`.
- Admin определяется через stored role или bootstrap email `ayurash@me.com`.
- `/dashboard` доступен admin и отвечает за управление пользователями.
- Admin может управлять пользователями, чужими фильмами/комментариями и видимыми сообщениями чата.
- Обычный пользователь управляет своим контентом.

## Важные ограничения

- Schema changes только через миграции.
- Не импортировать `src/server/session.ts`, `src/lib/db.ts`, Prisma runtime или `node:*` на верхнем уровне модулей, которые импортируются клиентом. Импортировать их внутри `createServerFn().handler(...)` или server route handlers.
- `pnpm typecheck` не ловит import-protection проблемы, поэтому после изменений server/client границ запускать `pnpm build`.
- Для uploads не возвращать прямой S3 URL без причины: используем `/uploads/...` и same-origin proxy.

Больше handoff-контекста для новых чатов: [AGENTS.md](./AGENTS.md), [src/server/AGENTS.md](./src/server/AGENTS.md), [src/routes/AGENTS.md](./src/routes/AGENTS.md).
