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
- Для page-specific кнопок в шапке используй props `leading` и `actions` у `<PageTitle />`; не рисуй отдельную строку с back/edit внутри страницы без необходимости.
- На основных страницах каталога header показывает залитую icon-only кнопку добавления `h-8`: `/` открывает dropdown выбора типа, `/movies?kind=...` ведет сразу к добавлению этого типа.
- Header использует backdrop/тень без нижнего `border-b`.
- `NavigationProgress` рендерится последним слоем header через узкую подписку
  `useRouterState`; `main` получает `aria-busy` во время перехода.
- Для loader-heavy маршрутов `/`, `/movies/`, `/movies/$movieId` и
  `/people/$personId` сохраняй соответствующий `pendingComponent` из
  `RouteSkeletons`. Глобальные timings находятся в `src/router.tsx`: 120/250 мс.
  Не подключай page skeleton к add/edit формам или чату.

## Movie Routes

- Каталог фильтрует выбранный жанр через URL search param `genre`; счетчик в header берется из `searchMovies().total`, не из клиентского callback.
- Detail `/movies/$movieId` принимает search param `from`; back button ведет в этот безопасный внутренний URL или `/`.
- Detail рендерит только сохраненные ratings/cast и не вызывает metadata
  provider. В `Описание` остается только `movie.description`; затем идут
  ratings, cast, watch links и рецензии. При пустом rich cast показывается
  legacy `starring`.
- `MovieTrailers` объединяет локальные `movie.videos` с ручными
  `movie.trailerUrls`: automatic идут первыми, дубликаты скрываются, iframe
  создается только в открытом dialog. Карточки читают сохраненный
  `video.thumbnailUrl` и используют нейтральный fallback без постера фильма.
  Kinopoisk Widget не встраивается из-за `X-Frame-Options: DENY` и открывается
  внешней ссылкой; dialog используется для YouTube/Vimeo. Не запрашивай video
  provider из detail.
- Для сериалов detail показывает вкладки `О сериале` и `Сезоны и серии`.
  `SeriesSeasons` отображает нормализованные подробные данные из
  `movie.seriesSeasons` (названия, даты, описание, кадры) с сезонным
  селектором. Сериалы без подробных строк используют legacy fallback из
  `episodesPerSeason` и показывают generic эпизоды.
- Add/Edit `/movies/new` и `/movies/$movieId/edit` показывают `LookupCandidates` перед применением метаданных; данные мержатся в `MovieForm` только после выбора карточки. Кнопки `Отмена` и `Сохранить/Добавить` живут в закрепленном нижнем `MovieFormFooter`.
- Lookup всегда двухэтапный: поиск не должен грузить полные сезоны, а выбор
  candidate вызывает `loadMovieLookupDetails`. На edit `Обновить` использует
  сохраненные provider/external ID; не заменяй данные формы результатом stale
  запроса и не очищай старые серии при ошибке/пустом ответе.
- Add/edit применяют detailed metadata через общий
  `hasUsableMovieLookupDetails()`: series season shells без валидных episodes не
  считаются успешным import и сохраняют текущие seasons/ratings/cast.
- Ручных полей `Сезонов` и `Серий` в форме нет. `seriesSeasons` — скрытое
  импортируемое состояние; timestamp импорта выставляется только после
  успешной загрузки деталей.

## People и reviews

- `/people/$personId` принимает локальный `Person.id`; loader вызывает
  `getPerson`. Filmography ведет на `/movies/$movieId` для локальных совпадений
  и на `kinopoisk.ru/film/<externalId>` для внешних записей.
- Movie detail загружает `getReviews` отдельно. Автор review открывает общий
  `ProfileDialog` через `ay-movies:open-profile`; пользовательский текст в
  routes всегда использует термин «рецензия».

Focused проверки: `pnpm test:lookup`, `pnpm test:movie-videos`,
`pnpm test:movie-video-thumbnails`,
`pnpm test:movie-trailers`, `pnpm test:loading-ui`, `pnpm test:rich-metadata`,
`pnpm test:people`, `pnpm test:movie-detail-rich`, `pnpm test:reviews`.

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
