# Task 1: Kinopoisk Cast Role Enrichment

## Измененные файлы

- `src/server/movie-lookup-providers/kinopoisk-dev.ts`
- `scripts/movie-lookup.test.ts`
- `.superpowers/sdd/task-1-report.md`

## Реализация

- Добавлен batched запрос `/v1.4/person` с размером batch 10.
- Передаются `id` и `movies` через `selectFields`.
- Роль берется из кредита актера для текущего фильма по совпадающему ID.
- Порядок cast сохраняется.
- При ошибке любого person batch возвращается исходный cast с исходными ролями.
- Реализация зафиксирована коммитом `28ce9b3` (`feat(movies): enrich Kinopoisk cast roles`).

## TDD и команды

1. Добавлены два failing-теста в `scripts/movie-lookup.test.ts`:
   - 11 актеров, две person-запроса: 10 + 1, ответы кредитов в обратном порядке.
   - HTTP 503 от person endpoint с проверкой сохранения фильма, сезонов, ratings и cast с `null` role.
2. RED:
   - Команда: `pnpm test:lookup`
   - Результат: 33 passed, 1 failed.
   - Failure: `personRequests.length` был `0` вместо `2`.
3. GREEN:
   - Команда: `pnpm test:lookup`
   - Результат: 34 passed, 0 failed.
4. Дополнительная проверка:
   - Команда: `pnpm typecheck`
   - Результат: exit code 0.
5. Проверка diff:
   - Команда: `git diff --check`
   - Результат: exit code 0.

## Self-review

- Обогащаются только актеры без существующей роли.
- Запросы батчатся по 10 ID, поля ограничены `id` и `movies`.
- Ответы API сопоставляются по ID фильма и ID персоны, а не по порядку ответа.
- Ошибка API не стирает movie metadata, seasons, ratings или исходный cast.
- `.env`, `.env.example` и токены не изменялись и не печатались.

## Concerns

Нет.
