# Chat Reactions Design

Дата: 2026-08-18

## Цель

Сделать действия с сообщениями ближе к `shotmate`: без видимых кнопок около bubble, с реакциями и единым меню действий по right click / long press.

## Scope

- Убрать видимые hover/inline кнопки действий у сообщений.
- Desktop: по правому клику на сообщении открывать меню с реакциями сверху и действиями ниже.
- Mobile: по долгому тапу на сообщении открывать overlay с теми же реакциями и действиями.
- Поддержать реакции `👍`, `❤️`, `🔥`, `😂`, `😮`, `😢`.
- Один пользователь может иметь одну реакцию на одно сообщение.
- Повторный выбор той же реакции снимает реакцию.
- Выбор другой реакции заменяет предыдущую.
- Под bubble показывать компактные бейджи реакций с количеством.

## Data Model

- Добавить `ChatMessageReaction`:
  - `id`;
  - `messageId`;
  - `userId`;
  - `emoji`;
  - `createdAt`;
  - unique `[messageId, userId]`.
- При удалении сообщения реакции удаляются каскадом.

## Server Flow

- `getMessages` возвращает `reactions` для каждого сообщения.
- Добавить server function `toggleChatMessageReaction`.
- Доступ к реакции разрешен только участнику доступного thread:
  - direct thread: участник direct-чата;
  - global thread: авторизованный пользователь автоматически добавляется в participants, как сейчас.
- Emoji валидируются строго по списку.

## UI Flow

- Bubble целиком остается trigger для контекстного меню.
- В меню сверху горизонтальный ряд быстрых реакций.
- Ниже действия:
  - `Ответить`;
  - `Копировать`, если есть текст;
  - `Редактировать`, если сообщение свое или пользователь admin;
  - `Удалить`, если сообщение свое или пользователь admin.
- На mobile долгий тап открывает full-screen/anchored overlay без видимых inline кнопок.
- Reaction badges отображаются под bubble; клик по бейджу тоже переключает эту реакцию.

## Verification

- Добавить tests для server/UI source contract в существующий `tsx --test` runner.
- Проверить:
  - schema содержит `ChatMessageReaction`;
  - server содержит `toggleChatMessageReaction` и strict emoji list;
  - UI больше не содержит `MessageActions`;
  - UI содержит long press и reaction bar/menu.
- Запустить `pnpm test`, `pnpm typecheck`, `pnpm build`.
- После реализации сделать commit, push и deploy на Timeweb VDS.
