# AGENTS.md

Контекст для `src/routes`.

## Общие правила

- Routes file-based через TanStack Router.
- Для заголовка страницы используй `<PageTitle />`; не дублируй основной заголовок внутри страницы без необходимости.
- Guards делай в `beforeLoad`, используя `context.user` из `__root.tsx`.
- Server data грузится через route `loader` и server functions из `src/server`.
- После mutation вызывай `router.invalidate()` и нужные window events, если счетчики sidebar/notifications должны обновиться.

## Root layout

- `__root.tsx` отвечает за sidebar, header, profile/theme dialogs, Toaster и специальный layout `/chat`.
- Для `/chat` root фиксируется по высоте viewport: `h-svh overflow-hidden`; не возвращай общий body/page scroll для активного диалога.
- Header title приходит из `AppTitleProvider`.
- На основных страницах каталога header показывает залитую icon-only кнопку добавления `h-8`: `/` открывает dropdown выбора типа, `/movies?kind=...` ведет сразу к добавлению этого типа.
- Header использует backdrop/тень без нижнего `border-b`.

## Movie Routes

- Каталог фильтрует выбранный жанр через URL search param `genre`; счетчик в header берется из `searchMovies().total`, не из клиентского callback.
- Detail `/movies/$movieId` принимает search param `from`; back button ведет в этот безопасный внутренний URL или `/`.
- Для сериалов detail показывает вкладки `О сериале` и `Сезоны и серии`; реальные названия эпизодов пока не хранятся, поэтому список строится из `episodesPerSeason`.

## Dashboard/Friends

- `/dashboard` — admin-only администрирование пользователей.
- `/friends` — пользовательская страница друзей, открывается из dropdown пользователя.
- Профиль пользователя все еще живет на `/dashboard/$userId`; для обычных пользователей back button ведет на `/friends`.

## Chat route

- `/chat` показывает список диалогов и активный thread.
- Общий чат всегда первым в списке; блок "Новый диалог" открывает direct thread через `/chat?user=<id>`.
- На desktop composer должен быть закреплен снизу chat section, скроллится только messages container.
- На mobile `/chat` без query показывает список; при открытом явном thread/user список скрыт, back button ведет на `/chat`.
- Composer поддерживает text, image, reply, edit mode; attachment disabled while editing.
- Сообщения открывают context menu по right click: ответить, копировать, редактировать, удалить; quick action buttons остаются fallback.
- Автоскролл при открытии/отправке/загрузке фото должен идти через `messagesRef.current.scrollTo({ top: scrollHeight })`, с повтором после layout. Не возвращай marker `scrollIntoView`.
- Не добавляй autofocus при открытии sidebar/sheet.

## Upload routes

- `uploads.posters.$file.tsx`, `uploads.avatars.$file.tsx`, `uploads.chat.$file.tsx` валидируют имя файла, отдают local файл или проксируют S3.
- Сохраняй поддержку `GET` и `HEAD`, cache headers и range headers.

## UI

- Существующий стиль: компактные радиусы, темная тематическая палитра, сильные тени карточек/header.
- Для недостающих контролов придерживайся shadcn/Radix-паттернов и локальных компонентов из `src/components/ui`.
- На мобильных input font-size должен оставаться не меньше 16px, чтобы iPhone не зумил UI при фокусе.
