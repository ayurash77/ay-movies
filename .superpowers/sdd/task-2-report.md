# Task 2: Two-Line Compact Actor Cards

## Статус

DONE

## Изменения

- `src/components/movies/MovieCast.tsx`
  - Имя актера переведено на `line-clamp-2`, `text-[13px]`, `leading-snug`.
  - Роль переведена на `line-clamp-2`, `text-[11px]`, `leading-snug`.
  - Убраны `truncate`; grid, portrait и условный рендер nullable role не изменялись.
- `scripts/movie-detail-rich.test.ts`
  - В compact cast test добавлены проверки двухстрочного clamp имени и роли,
    отсутствия `truncate` у имени и размера роли `text-[11px]`.

## TDD

1. Добавлены assertions в тест до изменения компонента.
2. `pnpm test:movie-detail-rich` дал ожидаемый FAIL: имя имело классы
   `truncate text-sm ...`, без `line-clamp-2`.
3. Внесено минимальное изменение классов в `MovieCast.tsx`.
4. Повторный focused test и provider test прошли.

## Команды и результаты

- `pnpm test:movie-detail-rich` — PASS, 18/18.
- `pnpm test:lookup` — PASS, 32/32.
- `git diff --check` — PASS, ошибок whitespace нет.
- Self-review diff — лишних изменений не обнаружено; изменены только два
  целевых файла до добавления этого отчета.

## Коммиты

- Код и тест: `7240962af25309ffdb0a389e449097a67df491c9`
- Отчет: hash будет указан после коммита отчета в финальном сообщении.

## Concerns

Нет.
