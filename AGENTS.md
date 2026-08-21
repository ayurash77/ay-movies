# AGENTS.md

Контекст для Codex/Claude при работе с AY Movies. Отвечай пользователю по-русски, коротко и по делу.

## Рабочий процесс

- После законченной задачи делай осмысленный коммит и push текущей ветки, если пользователь явно не сказал иначе.
- Не трогай `.env` и секреты. Env живет в `.env`, пример в `.env.example`.
- Перед изменениями смотри текущие паттерны в коде. Не делай широкие рефакторы без необходимости.
- Если меняешь Prisma schema, создавай миграцию через `pnpm db:migrate:dev`; bare `db:push` использовать только для локальных экспериментов.

## Команды

```bash
pnpm dev             # dev server, порт 3002
pnpm test            # полный набор contract/unit тестов
pnpm build           # production build
pnpm typecheck       # tsc --noEmit

pnpm dc:up           # PostgreSQL 18 в Docker, host port 5434
pnpm dc:down         # остановить Docker Compose
pnpm db:migrate:dev  # создать и применить миграцию
pnpm db:generate     # regenerate Prisma client
pnpm db:seed         # очистить и пересоздать demo data
pnpm db:studio       # Prisma Studio
pnpm db:refresh-movie-metadata        # dry-run массового обновления
pnpm db:refresh-movie-metadata:apply  # применить подготовленные обновления
```

Демо-пароль после seed: `demo123`. Demo users включают `demo@ay-movies.dev` и администратора `ayurash@me.com`.

## Деплой

Timeweb VDS: domain `movies.ayurash.ru`, исходники
`/opt/ayurash/apps/ay-movies`, Compose project `/opt/ayurash`, service
`ay-movies`, runtime env `/opt/ayurash/env/ay-movies.env`. Контейнер применяет
миграции через `prisma migrate deploy`; для автоматических видео и их превью
нужны `20260821130000_movie_videos` и
`20260821170000_movie_video_thumbnails`. Env names: `DATABASE_URL`,
`SESSION_SECRET`, `WEB_ALLOWED_HOSTS`, `S3_*`, `KINOPOISK_DEV_TOKEN`,
`KINOPOISK_DEV_BASE_URL`, `KINOPOISK_UNOFFICIAL_TOKEN`,
`KINOPOISK_UNOFFICIAL_BASE_URL`.

Production source directory не является Git checkout. Не запускай там
`git pull`: синхронизируй tracked-файлы локального `main` через
`/Users/ayurash/Development/_Projects/ayurash-infra/scripts/deploy-app-source.sh`,
затем выполняй `docker compose up -d --build ay-movies` из `/opt/ayurash`.

OpenAI не используется:
`lookupMovieCandidates` параллельно обращается к доступным Kinopoisk search
providers, а затем упорядочивает результаты с `kinopoisk.dev` как default.
Wikipedia/Wikidata остаются basic fallback. При загрузке деталей выбранный
provider пробуется первым, затем второй Kinopoisk provider как fallback:
default-порядок не переопределяет явный выбор пользователя. Токены провайдеров
остаются только на сервере: не логируй, не сериализуй в браузер и не добавляй в
примеры env.

Одноразовое массовое обновление запускается только вручную через
`scripts/refresh-movie-metadata.ts`. Сначала обязательно выполни production
dry-run без `--apply` и проверь `ambiguous`, `duplicate-conflict` и `failed`.
Перед `--apply` запусти `sudo systemctl start ayurash-backup.service`. Скрипт
поддерживает `--limit=N`, `--movie-id=ID` и `--delay-ms=N`; записи без точного
совпадения kind/year/title не меняются. Bulk-путь использует полный ответ одного
поиска `kinopoisk.dev`, а сезоны только для сериалов и видео запрашивает из
Kinopoisk Unofficial. Для текущих 169 записей это максимум 169 Dev и 233
Unofficial API-запроса. Ошибки квоты HTTP 402/403/429 немедленно останавливают
job и не маскируются как `not-found`.

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
- Карточки, страницы деталей, ручные и автоматически импортированные трейлеры/тизеры, ссылки "где смотреть", рейтинги 1–10, рецензии, watch list.
- У сериалов есть совместимые summary-поля `seasonsCount`/`episodesPerSeason` и
  нормализованные `SeriesSeason`/`SeriesEpisode` с локальными и оригинальными
  названиями, описаниями, датами и изображениями эпизодов.
- Роли `USER`/`ADMIN`; `ayurash@me.com` всегда admin через `resolveRole`.
- Dashboard: admin-only администрирование пользователей. Друзья живут на отдельной странице `/friends` из меню пользователя.
- Профиль в диалоге, аватар пользователя, admin badge.
- Друзья, подписки, уведомления о новых фильмах, рецензиях и сообщениях.
- Чат: закрепленный общий чат, личные диалоги с друзьями, polling, unread counters, ответы, фото, context menu, редактирование/удаление своих сообщений; admin может управлять любыми видимыми сообщениями.
- Темы оформления из `src/lib/theme.ts`; default `ayu`.

## Server-only и import protection

Главная ловушка проекта: модули, импортируемые компонентами/роутами на клиенте, не должны тащить server-only код на верхнем уровне.

Правила:
- `src/server/session.ts`, `src/server/password.ts`, `src/lib/db.ts`, node modules вроде `node:crypto` и Prisma должны попадать в клиентские импорты только внутри `createServerFn().handler(...)` или server route handlers.
- Не делай top-level helper `getAuthUser()` в server-модуле, который сам импортируется UI. Импортируй `./session` внутри handler.
- Type-only imports допустимы: `import type { PrismaClient } from '@prisma/client'`.
- После сомнительных изменений запускай `pnpm build`, потому что `pnpm typecheck` такие ошибки не ловит.

## Метаданные, персоны и рецензии

- Поиск фильма двухэтапный: `lookupMovieCandidates` параллельно вызывает
  доступные Kinopoisk searches, упорядочивает их с `kinopoisk.dev` как
  preferred/default и возвращает только легкие карточки. Wikipedia/Wikidata
  остаются basic fallback и не содержат подробностей эпизодов.
- `loadMovieLookupDetails` загружает полные данные только после выбора точного
  кандидата: сначала из provider выбранной карточки, затем из другого Kinopoisk
  provider как fallback. `kinopoisk.dev` не переопределяет явный выбор
  пользователя. Для сохраненного источника кнопка `Обновить` сначала идет
  напрямую по `metadataProvider` и `metadataExternalId`; при ошибке или пустом
  результате UI делает fallback title search.
- Ratings и cast приходят только из detailed `kinopoisk.dev` lookup и хранятся
  локальным snapshot в `Movie`, `Person` и `MoviePersonCredit`. Detail фильма
  читает snapshot из БД и никогда не вызывает провайдера. Успешный частичный
  refresh обновляет только валидные значения; пустые ratings/cast и ошибки не
  стирают ранее сохраненные данные. Отсутствующие роли актеров обогащаются из
  person filmography пакетами до 10 ID, concurrency 4 и с общим deadline 15
  секунд; ошибка сохраняет исходный ordered cast. `starring` остается legacy
  fallback.
- Автоматические трейлеры/тизеры приходят через video endpoint Kinopoisk
  Unofficial при добавлении или явном `Обновить` и хранятся в `MovieVideo`.
  YouTube preview вычисляется из video ID; preview Kinopoisk Widget сервер
  извлекает из JSON `data-state` страницы widget с ограниченным concurrency и
  общим timeout. `thumbnailUrl` сохраняется в snapshot, detail не обращается к
  provider. Для старых записей preview появляется после `Обновить`.
  `Movie.trailerUrls` остается отдельным ручным контентом пользователя. Detail
  читает оба источника только из БД, дедуплицирует их для отображения и создает
  iframe YouTube/Vimeo только после выбора карточки. Kinopoisk Widget отвечает
  `X-Frame-Options: DENY`, поэтому его карточки открываются внешней ссылкой, а
  не в dialog. UI использует preview конкретного видео, а при его отсутствии
  нейтральный fallback, не постер фильма. Пустой/ошибочный refresh не удаляет
  ранее сохраненный непустой video snapshot.
- `/people/$personId` использует локальный `Person.id`. Профиль и полная
  актерская фильмография кэшируются на 7 дней. `profileRefreshAttemptedAt`
  фиксирует complete, partial и failed provider attempts; 15-минутный backoff
  возвращает валидный stale cache или temporary unavailable без повторного
  provider call. Partial refresh не меняет `profileUpdatedAt`. Одновременные
  refresh одного local person coalesced в одном server process.
  Filmography ограничена 2000 записями, enrichment идет пакетами до 100,
  concurrency 4 и с deadline 15 секунд. Локальные совпадения по
  `metadataExternalId` ведут на `/movies/$movieId`, остальные — на Кинопоиск.
- В UI/API используется термин `рецензия`, но физическая Prisma-модель/таблица
  `Comment` и внутренние `_count.comments` сохранены. Автор и `ADMIN` могут
  редактировать/удалять рецензию; карточка показывает avatar и открывает
  profile dialog. UI допускает только одну review mutation одновременно,
  уведомления имеют type `REVIEW`.
- Перед записью `normalizeSeriesMetadata()` удаляет невалидные/повторные номера,
  нормализует пустые строки и даты, сортирует сезоны и серии. Данные хранятся в
  `Movie.seriesSeasons` и `SeriesSeason.episodes`; списки и карточки читают
  только summary-поля без join к подробным таблицам.
- `hasUsableMovieLookupDetails()` — общий predicate provider fallback и add/edit
  form application. Для `SERIES` он использует нормализованный snapshot и
  требует хотя бы один валидный эпизод; `normalizeUsableSeriesMetadata()`
  защищает persistence от replacement пустыми season shells.
- Снимок подробных данных заменяет старый только если после нормализации он
  непустой. Замена, обновление summary и создание вложенных строк выполняются
  одной транзакцией. Пустой или неуспешный ответ сохраняет прежние snapshot и
  summary.
- `metadataProvider` и `metadataExternalId` сохраняются только как явно
  переданный источник. `metadataUpdatedAt` меняется только после успешного
  подробного импорта, а не при обычном редактировании или ошибке провайдера.
- Сезоны и серии не редактируются вручную: форма удерживает импортированный
  snapshot скрыто и отправляет его при сохранении. Старые сериалы без строк
  `SeriesSeason` продолжают показывать generic список из summary-полей.
- Миграция `prisma/migrations/20260820170000_series_episode_metadata` добавляет
  source-поля и таблицы без backfill; production применяет ее через
  `prisma migrate deploy` при старте контейнера.
- Миграция `prisma/migrations/20260821130000_movie_videos` добавляет enum и
  таблицу `MovieVideo` без изменения старых `trailerUrls`.
- Миграция `prisma/migrations/20260821170000_movie_video_thumbnails` добавляет
  nullable `MovieVideo.thumbnailUrl` без backfill.

Полезные focused проверки:

```bash
pnpm test:series-metadata
pnpm test:lookup
pnpm test:movie-videos
pnpm test:movie-video-thumbnails
pnpm test:movie-trailers
pnpm test:loading-ui
pnpm test:rich-metadata
pnpm test:metadata-refresh
pnpm test:people
pnpm test:movie-form-flow
pnpm test:movie-navigation-detail
pnpm test:movie-detail-rich
pnpm test:reviews
```

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
- `Skeleton` и `ProgressiveImage` из `src/components/ui` — единый путь для
  loading placeholders изображений. Не добавляй параллельную shimmer-систему.
- Router использует `defaultPendingMs: 120` и `defaultPendingMinMs: 250`.
  Каталоги, movie detail и person detail имеют page-shaped pending skeletons;
  тонкий progress bar всегда остается внутри sticky header.

## Handoff checklist

Перед передачей работы в другой чат:
- `git status --short` и список незакоммиченных файлов.
- Что изменено и почему.
- Какие проверки прошли (`pnpm typecheck`, `pnpm build`, миграции).
- Есть ли открытые риски: Prisma warning в client build, миграции, deploy env, S3/CORS, mobile layout.
