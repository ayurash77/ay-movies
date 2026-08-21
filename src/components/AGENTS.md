# AGENTS.md

Контекст для `src/components`.

## Общий UI

- Используй локальные primitives из `src/components/ui` и текущие Tailwind-паттерны проекта.
- Радиусы компактные, тени заметные, цвета берутся из theme tokens.
- Не добавляй маркетинговые/описательные блоки внутрь приложения; интерфейс должен быть рабочим и плотным.
- На мобильных у input/textarea не опускай font-size ниже 16px, чтобы iPhone не зумил UI при фокусе.

## Sidebar

- Верхняя навигация: `Фильмотека`, `Фильмы`, `Сериалы`, `Мультфильмы`, `Чат`, `Уведомления`, затем блок `Мои списки`.
- `Dashboard` и `Друзья` не показываются как основные пункты sidebar; они находятся в dropdown пользователя.
- `Добавить` находится в нижнем блоке над `Оформление`; между ними отдельный разделитель.
- Не включай autofocus поиска при открытии mobile sidebar/sheet.
- Счетчики в меню приходят из `getSidebarCounts`; после mutations дергай window events, если нужно обновить sidebar.

## Header Add Button

- Кнопка `+` в header задается в `src/routes/__root.tsx`, но визуально должна совпадать по высоте с `Button size="sm"` из sidebar: `h-8`, залитый default variant, icon-only, без текста.
- На `/` кнопка открывает dropdown выбора типа. На `/movies?kind=...` ведет сразу в `/movies/new` с этим `kind`.
- Page-specific кнопки шапки идут через `<PageTitle leading actions />`; правые icon-only действия должны визуально совпадать с header `+`.

## Profile/Theme Dialogs

- Профиль пользователя открывается в диалоге из dropdown пользователя.
- Admin badge отображай рядом с именем, если роль `ADMIN`.
- Темы берутся из `src/lib/theme.ts`; default `ayu`.

## Movie Components

- Карточки фильмов компактные, с иконкой типа в правом верхнем углу.
- `MovieCard` передает текущий URL каталога в search param `from`, чтобы detail-страница возвращала пользователя в тот же фильтр/жанр/сортировку.
- Для сериалов показывай сезоны и количество серий.
- Галереи должны поддерживать поиск/сортировку/группировки без layout shift.
- `MovieRatings` показывает только доступные provider snapshots и отдельный
  числовой рейтинг AY Movies по шкале 1–10; оценивание и удаление своей оценки
  открываются в popover. `MovieCast` использует компактные строки с круглыми
  портретами и локальными person links, разворачивает полный импортированный
  cast и показывает `starring` только как fallback.
- `PersonFilmography` ведет локальные записи на movie detail с `from`, внешние
  открывает на Кинопоиске в новой вкладке; портреты/постеры имеют стабильный
  placeholder.
- `ReviewsSection` — публичная терминология для физических `Comment` rows.
  Карточка показывает avatar/name и открывает `ProfileDialog` через событие
  `ay-movies:open-profile`. Один общий `mutationLock` сериализует add/update/
  delete и блокирует открытие редактора во время mutation.

Focused проверки: `pnpm test:movie-detail-rich` и `pnpm test:reviews`.
