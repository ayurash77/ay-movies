# AGENTS.md

Контекст для `src/server`.

## Правила server functions

- Все клиентские действия идут через `createServerFn`.
- Server-only imports (`./session`, `@/lib/db`, `node:crypto`, Prisma runtime, storage) держи внутри `.handler(...)`, если файл импортируется UI/route компонентами.
- Не экспортируй обычные функции с прямым доступом к cookie/DB из модулей, которые импортирует клиент.
- Для новых входных данных используй `zod` validator.
- Возвращай `{ ok: true as const, ... }` / `{ ok: false as const, error }`, как в текущих модулях.

## Модули

- `auth.ts` — sign up/sign in/sign out/getSessionUser.
- `session.ts` — server-only cookie/session helpers.
- `password.ts` — scrypt hashing.
- `movies.ts` — каталог, поиск, пагинация, CRUD, рейтинги, watch lists.
- `movie-lookup.ts` — автозаполнение без AI tokens через Wikipedia/Wikidata; сначала пробует точную страницу, затем search, фильтрует не-media сущности и для сериалов берет год из `P580`, если нет `P577`.
- `dashboard.ts` — dashboard, users, friends, followers, roles.
- `notifications.ts` — уведомления для фильмов, комментариев и chat messages.
- `chat.ts` — общий global thread, direct threads только с друзьями, polling data, read counters, replies/images/edit/delete.
- `uploads.ts`, `profile.ts`, `storage.ts` — постеры, аватары, S3/local storage.
- `sidebar.ts` — счетчики для меню.

## Права

- `resolveRole()` из `src/lib/user-roles.ts` делает `ayurash@me.com` admin независимо от stored role.
- Admin может управлять ролями, чужими фильмами/комментариями и видимыми chat messages.
- Общий чат доступен всем авторизованным пользователям; персональные уведомления о chat messages создаются только для direct threads.
- Обычный пользователь управляет только своим контентом.

## Prisma

- Любое изменение schema требует миграции: `pnpm db:migrate:dev`.
- Production применяет `prisma migrate deploy` из Docker CMD.
- После schema changes запускать `pnpm db:generate`, если Prisma client не обновился автоматически.

## Uploads

- `storeUpload()` возвращает `/uploads/<subdir>/<file>`.
- Не возвращай прямой S3 URL в новый код без отдельной причины.
- Поддиректории upload storage сейчас: `posters`, `avatars`, `chat`.
