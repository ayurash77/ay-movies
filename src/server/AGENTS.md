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
- `movies.ts` — каталог, поиск, пагинация, CRUD, рейтинги, watch lists и
  транзакционное сохранение подробных snapshot сезонов/серий.
- `movie-lookup.ts` — `lookupMovieCandidates` возвращает легкие candidates,
  `loadMovieLookupDetails` загружает детали выбранного provider/external ID;
  `lookupMovie` оставлен совместимым wrapper. Providers лежат в
  `movie-lookup-providers/`: `kinopoisk.dev` работает при
  `KINOPOISK_DEV_TOKEN` и основной для детальных серий,
  `kinopoiskapiunofficial.tech` при `KINOPOISK_UNOFFICIAL_TOKEN` используется
  fallback, Wikipedia/Wikidata остается fallback без токенов только для
  базовых метаданных.
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
- Подробности сериалов хранятся нормализованно: `Movie.seriesSeasons` и
  `SeriesSeason.episodes`, с cascade delete и уникальностью номера в пределах
  родителя. Сопоставляй и сохраняй данные через
  `normalizeSeriesMetadata()`/`seriesSnapshotWriteData()`, не через ручные
  массивы строк.
- `seasonsCount` и `episodesPerSeason` остаются summary и fallback для старых
  данных. List/card queries не должны включать `seriesSeasons` или `episodes`;
  их загружает только `getMovie` с порядком по номеру сезона и серии.
- Новый непустой нормализованный snapshot заменяет старый в одной транзакции.
  При пустом/неуспешном detail lookup сохраняй текущие snapshot и summary. При
  переводе записи из `SERIES` в другой kind очищай подробные строки и summary.
- `metadataProvider` и `metadataExternalId` — выбранный источник; не меняй их
  без явно submitted source. `metadataUpdatedAt` обновляй только после
  успешного detailed import, не при обычном save, Wikidata или provider error.

## Проверки подробных серий

```bash
pnpm test:series-metadata
pnpm test:lookup
pnpm test:movie-form-flow
pnpm test:movie-navigation-detail
pnpm typecheck
pnpm build
```

## Uploads

- `storeUpload()` возвращает `/uploads/<subdir>/<file>`.
- Не возвращай прямой S3 URL в новый код без отдельной причины.
- Поддиректории upload storage сейчас: `posters`, `avatars`, `chat`.
