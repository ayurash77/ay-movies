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
  транзакционное сохранение подробных snapshot сезонов/серий и rich metadata.
- `movie-rich-metadata.ts` — сохраняет rating snapshots и ordered cast через
  `Person`/`MoviePersonCredit`. Detail читает только БД. Частичные ratings
  обновляют переданные поля, а пустой/неуспешный cast сохраняет старые credits.
- `movie-lookup.ts` — `lookupMovieCandidates` параллельно вызывает доступные
  Kinopoisk searches, возвращает легкие candidates и упорядочивает общий список
  с `kinopoisk.dev` как preferred/default. `loadMovieLookupDetails` загружает
  детали выбранного provider/external ID: сначала provider карточки, затем
  другой Kinopoisk provider как fallback; default не переопределяет явный
  пользовательский выбор. `lookupMovie` оставлен совместимым wrapper.
  Providers лежат в `movie-lookup-providers/`: `kinopoisk.dev` работает при
  `KINOPOISK_DEV_TOKEN`, `kinopoiskapiunofficial.tech` при
  `KINOPOISK_UNOFFICIAL_TOKEN`; Wikipedia/Wikidata остается fallback без
  токенов только для базовых метаданных.
- `dashboard.ts` — dashboard, users, friends, followers, roles.
- `people.ts` — `getPerson` по локальному `Person.id`: cache TTL 7 дней,
  stale fallback, merge partial refresh и 15-минутный retry backoff по
  `profileRefreshAttemptedAt`. Complete refresh обновляет `profileUpdatedAt` и
  attempt, partial/failed — только attempt; concurrent refresh одного local ID
  coalesced in-process. Полная актерская filmography до 2000 записей
  обогащается пакетами до 100, concurrency 4, deadline 15 секунд; локальные
  фильмы сопоставляются по `metadataExternalId`.
- `reviews.ts` — review API поверх физической Prisma-модели `Comment`; avatar,
  title/sentiment/text, owner/admin edit/delete, максимум 100 записей на detail.
- `notifications.ts` — уведомления для фильмов, рецензий (`REVIEW`) и chat messages.
- `chat.ts` — общий global thread, direct threads только с друзьями, polling data, read counters, replies/images/edit/delete.
- `uploads.ts`, `profile.ts`, `storage.ts` — постеры, аватары, S3/local storage.
- `sidebar.ts` — счетчики для меню.

## Права

- `resolveRole()` из `src/lib/user-roles.ts` делает `ayurash@me.com` admin независимо от stored role.
- Admin может управлять ролями, чужими фильмами/рецензиями и видимыми chat messages.
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
- Provider fallback и add/edit используют один `hasUsableMovieLookupDetails()`:
  сериал пригоден только при наличии хотя бы одного валидного эпизода после
  нормализации. Persistence использует `normalizeUsableSeriesMetadata()`, чтобы
  empty season shells не заменяли существующий snapshot.
- `metadataProvider` и `metadataExternalId` — выбранный источник; не меняй их
  без явно submitted source. `metadataUpdatedAt` обновляй только после
  успешного detailed import, не при обычном save, Wikidata или provider error.
- `Person` (включая nullable `profileRefreshAttemptedAt`) и `MoviePersonCredit`, nullable rating columns и review-поля
  физической таблицы `Comment` добавляет миграция
  `20260820200000_movie_people_reviews`. Старые rows остаются neutral reviews;
  внутренние relations/counts по-прежнему называются `comments`.

## Focused проверки

```bash
pnpm test:series-metadata
pnpm test:lookup
pnpm test:rich-metadata
pnpm test:people
pnpm test:movie-form-flow
pnpm test:movie-navigation-detail
pnpm test:movie-detail-rich
pnpm test:reviews
pnpm typecheck
pnpm build
```

## Uploads

- `storeUpload()` возвращает `/uploads/<subdir>/<file>`.
- Не возвращай прямой S3 URL в новый код без отдельной причины.
- Поддиректории upload storage сейчас: `posters`, `avatars`, `chat`.
