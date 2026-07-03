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
- На основных страницах каталога header показывает icon-only кнопку добавления: `/` открывает dropdown выбора типа, `/movies?kind=...` ведет сразу к добавлению этого типа.

## Dashboard/Friends

- `/dashboard` — admin-only администрирование пользователей.
- `/friends` — пользовательская страница друзей, открывается из dropdown пользователя.
- Профиль пользователя все еще живет на `/dashboard/$userId`; для обычных пользователей back button ведет на `/friends`.

## Chat route

- `/chat` показывает список диалогов и активный thread.
- На desktop composer должен быть закреплен снизу chat section, скроллится только messages container.
- На mobile при открытом диалоге список диалогов скрыт, back button ведет на `/chat`.
- Composer поддерживает text, image, reply, edit mode; attachment disabled while editing.
- Не добавляй autofocus при открытии sidebar/sheet.

## Upload routes

- `uploads.posters.$file.tsx`, `uploads.avatars.$file.tsx`, `uploads.chat.$file.tsx` валидируют имя файла, отдают local файл или проксируют S3.
- Сохраняй поддержку `GET` и `HEAD`, cache headers и range headers.

## UI

- Существующий стиль: компактные радиусы, темная тематическая палитра, сильные тени карточек/header.
- Для недостающих контролов придерживайся shadcn/Radix-паттернов и локальных компонентов из `src/components/ui`.
- На мобильных input font-size должен оставаться не меньше 16px, чтобы iPhone не зумил UI при фокусе.
