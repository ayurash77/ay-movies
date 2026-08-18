import { createServerFn } from '@tanstack/react-start';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

import { formatRuDateTime } from '@/lib/date-format';
import { toServedUploadUrl } from '@/lib/upload-url';

type Db = PrismaClient;
type AuthUser = {
    id: string;
    role: string;
};
type ChatThreadKind = 'DIRECT' | 'GLOBAL';

const GLOBAL_THREAD_KEY = '__global__';
const GLOBAL_CHAT_TITLE = 'Общий чат';

export type ChatUser = {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
};

export type ChatMessageData = {
    id: string;
    text: string;
    imageUrl: string | null;
    createdAt: string;
    createdAtLabel: string;
    author: ChatUser;
    isMine: boolean;
    canManage: boolean;
    replyTo: {
        id: string;
        text: string;
        imageUrl: string | null;
        authorName: string;
        isMine: boolean;
    } | null;
};

export type ChatThreadSummary = {
    id: string;
    kind: ChatThreadKind;
    title: string;
    friend: ChatUser | null;
    updatedAt: string;
    unreadCount: number;
    lastMessage: {
        text: string;
        createdAt: string;
        authorName: string;
        isMine: boolean;
    } | null;
};

export type ChatPageData = {
    ok: true;
    threads: ChatThreadSummary[];
    activeThread: ChatThreadSummary | null;
    messages: ChatMessageData[];
    startUsers: ChatUser[];
} | {
    ok: false;
    error: string;
    threads: ChatThreadSummary[];
    activeThread: null;
    messages: [];
    startUsers: ChatUser[];
};

const chatPageSchema = z.object({
    threadId: z.string().min(1).optional(),
    userId: z.string().min(1).optional(),
});

const CHAT_EXT_BY_MIME: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
};
const MAX_CHAT_IMAGE_BYTES = 8 * 1024 * 1024;
const chatImageUrlSchema = z.string().trim().regex(/^\/uploads\/chat\/[a-f0-9]+\.(jpg|png|webp)$/);

const sendMessageSchema = z.object({
    threadId: z.string().min(1).optional(),
    userId: z.string().min(1).optional(),
    text: z.string().trim().max(2000).default(''),
    replyToId: z.string().min(1).optional(),
    imageUrl: chatImageUrlSchema.optional(),
}).refine((value) => value.text.length > 0 || Boolean(value.imageUrl), {
    message: 'Нужно написать сообщение или прикрепить фото',
});

const threadSchema = z.object({ threadId: z.string().min(1) });
const messageSchema = z.object({ messageId: z.string().min(1) });
const updateMessageSchema = z.object({
    messageId: z.string().min(1),
    text: z.string().trim().max(2000),
});

function directThreadKey(a: string, b: string) {
    return [ a, b ].sort().join(':');
}

function mapChatUser(user: { id: string; name: string; email: string; avatarUrl: string | null }): ChatUser {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: toServedUploadUrl(user.avatarUrl),
    };
}

async function canChatWith(db: Db, userId: string, friendId: string) {
    if (userId === friendId) return false;
    const friendship = await db.userFriend.findFirst({
        where: {
            OR: [
                { userId, friendId },
                { userId: friendId, friendId: userId },
            ],
        },
        select: { id: true },
    });
    return Boolean(friendship);
}

async function ensureChatParticipant(db: Db, threadId: string, userId: string) {
    await db.chatParticipant.upsert({
        where: { threadId_userId: { threadId, userId } },
        update: {},
        create: { threadId, userId },
    });
}

async function getOrCreateGlobalThread(db: Db, userId: string) {
    const existing = await db.chatThread.findUnique({
        where: { privateKey: GLOBAL_THREAD_KEY },
        select: { id: true },
    });
    if (existing) {
        await ensureChatParticipant(db, existing.id, userId);
        return existing.id;
    }

    try {
        const thread = await db.chatThread.create({
            data: {
                privateKey: GLOBAL_THREAD_KEY,
                kind: 'GLOBAL',
                title: GLOBAL_CHAT_TITLE,
                participants: { create: { userId } },
            },
            select: { id: true },
        });
        return thread.id;
    } catch {
        const thread = await db.chatThread.findUnique({
            where: { privateKey: GLOBAL_THREAD_KEY },
            select: { id: true },
        });
        if (!thread) throw new Error('Не удалось открыть общий чат');
        await ensureChatParticipant(db, thread.id, userId);
        return thread.id;
    }
}

async function getOrCreateDirectThread(db: Db, userId: string, friendId: string) {
    if (!await canChatWith(db, userId, friendId)) {
        return { ok: false as const, error: 'Чат доступен только с друзьями' };
    }

    const privateKey = directThreadKey(userId, friendId);
    const existing = await db.chatThread.findUnique({
        where: { privateKey },
        select: { id: true },
    });
    if (existing) return { ok: true as const, threadId: existing.id };

    try {
        const thread = await db.chatThread.create({
            data: {
                privateKey,
                participants: {
                    create: [
                        { userId },
                        { userId: friendId },
                    ],
                },
            },
            select: { id: true },
        });
        return { ok: true as const, threadId: thread.id };
    } catch {
        const thread = await db.chatThread.findUnique({
            where: { privateKey },
            select: { id: true },
        });
        if (thread) return { ok: true as const, threadId: thread.id };
        return { ok: false as const, error: 'Не удалось открыть чат' };
    }
}

async function assertParticipant(db: Db, threadId: string, userId: string) {
    const participant = await db.chatParticipant.findUnique({
        where: { threadId_userId: { threadId, userId } },
        select: { id: true },
    });
    return Boolean(participant);
}

async function getAccessibleThread(db: Db, threadId: string, userId: string) {
    const thread = await db.chatThread.findUnique({
        where: { id: threadId },
        select: { id: true, kind: true },
    });
    if (!thread) return null;

    if (thread.kind === 'GLOBAL') {
        await ensureChatParticipant(db, thread.id, userId);
        return { id: thread.id, kind: 'GLOBAL' as const };
    }

    if (!await assertParticipant(db, thread.id, userId)) return null;
    return { id: thread.id, kind: 'DIRECT' as const };
}

async function getManageableMessage(db: Db, messageId: string, user: AuthUser) {
    const message = await db.chatMessage.findUnique({
        where: { id: messageId },
        select: { id: true, threadId: true, userId: true, imageUrl: true },
    });

    if (!message) return { ok: false as const, error: 'Сообщение не найдено' };
    if (user.role === 'ADMIN') return { ok: true as const, message };
    if (message.userId !== user.id) return { ok: false as const, error: 'Нет прав на это сообщение' };

    const isParticipant = await assertParticipant(db, message.threadId, user.id);
    if (!isParticipant) return { ok: false as const, error: 'Диалог не найден' };

    return { ok: true as const, message };
}

async function unreadCounts(db: Db, userId: string) {
    const rows = await db.$queryRawUnsafe<Array<{ threadId: string; count: bigint }>>(
        `
            SELECT m."threadId", COUNT(m."id") AS count
            FROM "ChatParticipant" cp
            JOIN "ChatMessage" m ON m."threadId" = cp."threadId"
            WHERE cp."userId" = $1
                AND m."userId" <> $1
                AND (cp."lastReadAt" IS NULL OR m."createdAt" > cp."lastReadAt")
            GROUP BY m."threadId"
        `,
        userId,
    );
    return new Map(rows.map((row) => [ row.threadId, Number(row.count) ]));
}

async function getChatStartUsers(db: Db, userId: string): Promise<ChatUser[]> {
    const friendships = await db.userFriend.findMany({
        where: {
            OR: [
                { userId },
                { friendId: userId },
            ],
        },
        orderBy: { createdAt: 'desc' },
        include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } },
            friend: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
    });

    const users = new Map<string, ChatUser>();
    for (const friendship of friendships) {
        const friend = friendship.userId === userId ? friendship.friend : friendship.user;
        if (friend.id !== userId) users.set(friend.id, mapChatUser(friend));
    }

    return [ ...users.values() ].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

async function mapThreads(db: Db, userId: string): Promise<ChatThreadSummary[]> {
    const [ threads, counts ] = await Promise.all([
        db.chatThread.findMany({
            where: { participants: { some: { userId } } },
            orderBy: { updatedAt: 'desc' },
            include: {
                participants: {
                    include: {
                        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
                    },
                },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    include: {
                        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
                    },
                },
            },
        }),
        unreadCounts(db, userId),
    ]);

    return threads.map((thread) => {
        const kind: ChatThreadKind = thread.kind === 'GLOBAL' ? 'GLOBAL' : 'DIRECT';
        const friend = thread.participants.find((item) => item.userId !== userId)?.user ?? null;
        const latest = thread.messages[0] ?? null;
        return {
            id: thread.id,
            kind,
            title: kind === 'GLOBAL'
                ? thread.title ?? GLOBAL_CHAT_TITLE
                : friend?.name ?? 'Диалог',
            friend: friend ? mapChatUser(friend) : null,
            updatedAt: thread.updatedAt.toISOString(),
            unreadCount: counts.get(thread.id) ?? 0,
            lastMessage: latest
                ? {
                    text: latest.text || (latest.imageUrl ? 'Фото' : ''),
                    createdAt: latest.createdAt.toISOString(),
                    authorName: latest.user.name,
                    isMine: latest.userId === userId,
                }
                : null,
        };
    }).sort((a, b) => {
        if (a.kind === 'GLOBAL' && b.kind !== 'GLOBAL') return -1;
        if (a.kind !== 'GLOBAL' && b.kind === 'GLOBAL') return 1;
        return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });
}

async function getMessages(db: Db, threadId: string, user: AuthUser): Promise<ChatMessageData[]> {
    const messages = await db.chatMessage.findMany({
        where: { threadId },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } },
            replyTo: {
                include: {
                    user: { select: { id: true, name: true } },
                },
            },
        },
    });

    return messages.reverse().map((message) => {
        const createdAt = message.createdAt.toISOString();
        return {
            id: message.id,
            text: message.text,
            imageUrl: toServedUploadUrl(message.imageUrl),
            createdAt,
            createdAtLabel: formatRuDateTime(createdAt),
            author: mapChatUser(message.user),
            isMine: message.userId === user.id,
            canManage: message.userId === user.id || user.role === 'ADMIN',
            replyTo: message.replyTo
                ? {
                    id: message.replyTo.id,
                    text: message.replyTo.text,
                    imageUrl: toServedUploadUrl(message.replyTo.imageUrl),
                    authorName: message.replyTo.user.name,
                    isMine: message.replyTo.userId === user.id,
                }
                : null,
        };
    });
}

async function markRead(db: Db, threadId: string, userId: string) {
    await Promise.all([
        db.chatParticipant.update({
            where: { threadId_userId: { threadId, userId } },
            data: { lastReadAt: new Date() },
        }),
        db.notification.updateMany({
            where: { userId, href: `/chat?thread=${threadId}`, readAt: null },
            data: { readAt: new Date() },
        }),
    ]);
}

export const getUnreadChatCount = createServerFn({ method: 'GET' }).handler(async () => {
    const { db } = await import('@/lib/db');
    const { getAuthUser } = await import('./session');
    const user = await getAuthUser();
    if (!user) return 0;
    await getOrCreateGlobalThread(db, user.id);
    const rows = await db.$queryRawUnsafe<Array<{ count: bigint }>>(
        `
            SELECT COUNT(m."id") AS count
            FROM "ChatParticipant" cp
            JOIN "ChatMessage" m ON m."threadId" = cp."threadId"
            WHERE cp."userId" = $1
                AND m."userId" <> $1
                AND (cp."lastReadAt" IS NULL OR m."createdAt" > cp."lastReadAt")
        `,
        user.id,
    );
    return Number(rows[0]?.count ?? 0);
});

export const getChatPageData = createServerFn({ method: 'GET' })
    .validator(chatPageSchema)
    .handler(async ({ data }): Promise<ChatPageData> => {
        const { db } = await import('@/lib/db');
        const { getAuthUser } = await import('./session');
        const user = await getAuthUser();
        if (!user) {
            return { ok: false, error: 'Нужен вход', threads: [], activeThread: null, messages: [], startUsers: [] };
        }

        const globalThreadId = await getOrCreateGlobalThread(db, user.id);
        const startUsersPromise = getChatStartUsers(db, user.id);
        let activeThreadId = data.threadId ?? null;
        if (!activeThreadId && data.userId) {
            const direct = await getOrCreateDirectThread(db, user.id, data.userId);
            const [ threads, startUsers ] = await Promise.all([
                mapThreads(db, user.id),
                startUsersPromise,
            ]);
            if (!direct.ok) {
                return {
                    ok: false,
                    error: direct.error,
                    threads,
                    activeThread: null,
                    messages: [],
                    startUsers,
                };
            }
            activeThreadId = direct.threadId;
        }
        if (!activeThreadId) activeThreadId = globalThreadId;

        if (activeThreadId) {
            const thread = await getAccessibleThread(db, activeThreadId, user.id);
            if (!thread) {
                const [ threads, startUsers ] = await Promise.all([
                    mapThreads(db, user.id),
                    startUsersPromise,
                ]);
                return {
                    ok: false,
                    error: 'Диалог не найден',
                    threads,
                    activeThread: null,
                    messages: [],
                    startUsers,
                };
            }
            await markRead(db, activeThreadId, user.id);
        }

        const [ threads, messages, startUsers ] = await Promise.all([
            mapThreads(db, user.id),
            activeThreadId ? getMessages(db, activeThreadId, user) : Promise.resolve([]),
            startUsersPromise,
        ]);

        return {
            ok: true,
            threads,
            activeThread: activeThreadId
                ? threads.find((thread) => thread.id === activeThreadId) ?? null
                : null,
            messages,
            startUsers,
        };
    });

export const uploadChatImage = createServerFn({ method: 'POST' })
    .validator((data: unknown) => {
        if (!(data instanceof FormData)) {
            throw new Error('Expected FormData');
        }
        return data;
    })
    .handler(async ({ data }) => {
        const { getAuthUser } = await import('./session');
        const user = await getAuthUser();
        if (!user) {
            return { ok: false as const, error: 'Требуется авторизация' };
        }

        const file = data.get('file');
        if (!(file instanceof File) || file.size === 0) {
            return { ok: false as const, error: 'Файл не найден' };
        }
        if (file.size > MAX_CHAT_IMAGE_BYTES) {
            return { ok: false as const, error: 'Файл больше 8 МБ' };
        }

        const ext = CHAT_EXT_BY_MIME[file.type];
        if (!ext) {
            return { ok: false as const, error: 'Поддерживаются только JPEG, PNG и WebP' };
        }

        try {
            const { storeUpload } = await import('./storage');
            const { url } = await storeUpload(
                'chat',
                ext,
                Buffer.from(await file.arrayBuffer()),
                file.type,
            );
            return { ok: true as const, url };
        } catch {
            return { ok: false as const, error: 'Не удалось сохранить фото' };
        }
    });

export const sendChatMessage = createServerFn({ method: 'POST' })
    .validator(sendMessageSchema)
    .handler(async ({ data }) => {
        const { db } = await import('@/lib/db');
        const { getAuthUser } = await import('./session');
        const user = await getAuthUser();
        if (!user) return { ok: false as const, error: 'Нужен вход' };

        let threadId = data.threadId ?? null;
        if (!threadId && data.userId) {
            const direct = await getOrCreateDirectThread(db, user.id, data.userId);
            if (!direct.ok) return { ok: false as const, error: direct.error };
            threadId = direct.threadId;
        }
        if (!threadId) return { ok: false as const, error: 'Диалог не выбран' };

        if (!await getAccessibleThread(db, threadId, user.id)) {
            return { ok: false as const, error: 'Диалог не найден' };
        }

        if (data.replyToId) {
            const replied = await db.chatMessage.findFirst({
                where: { id: data.replyToId, threadId },
                select: { id: true },
            });
            if (!replied) {
                return { ok: false as const, error: 'Сообщение для ответа не найдено' };
            }
        }

        const [ message, thread ] = await db.$transaction([
            db.chatMessage.create({
                data: {
                    threadId,
                    userId: user.id,
                    text: data.text,
                    imageUrl: data.imageUrl,
                    replyToId: data.replyToId,
                },
                include: { user: { select: { name: true } } },
            }),
            db.chatThread.update({
                where: { id: threadId },
                data: { updatedAt: new Date() },
                include: { participants: { select: { userId: true } } },
            }),
            db.chatParticipant.update({
                where: { threadId_userId: { threadId, userId: user.id } },
                data: { lastReadAt: new Date() },
            }),
        ]);

        const recipients = thread.participants
            .map((participant) => participant.userId)
            .filter((id) => id !== user.id);
        const notificationBody = message.text || 'Фото';

        if (thread.kind !== 'GLOBAL' && recipients.length) {
            try {
                const { createUserMessageNotification } = await import('./notifications');
                await Promise.all(recipients.map((recipientId) => createUserMessageNotification({
                    recipientId,
                    actorId: user.id,
                    title: `${message.user.name} написал сообщение`,
                    body: notificationBody.length > 180
                        ? `${notificationBody.slice(0, 177)}...`
                        : notificationBody,
                    href: `/chat?thread=${threadId}`,
                })));
            } catch {
                // Уведомления не должны блокировать отправку сообщения.
            }
        }

        return { ok: true as const, threadId };
    });

export const updateChatMessage = createServerFn({ method: 'POST' })
    .validator(updateMessageSchema)
    .handler(async ({ data }) => {
        const { db } = await import('@/lib/db');
        const { getAuthUser } = await import('./session');
        const user = await getAuthUser();
        if (!user) return { ok: false as const, error: 'Нужен вход' };

        const manageable = await getManageableMessage(db, data.messageId, user);
        if (!manageable.ok) return manageable;
        if (!data.text && !manageable.message.imageUrl) {
            return { ok: false as const, error: 'Сообщение не может быть пустым' };
        }

        await db.chatMessage.update({
            where: { id: manageable.message.id },
            data: { text: data.text },
        });

        return { ok: true as const, threadId: manageable.message.threadId };
    });

export const deleteChatMessage = createServerFn({ method: 'POST' })
    .validator(messageSchema)
    .handler(async ({ data }) => {
        const { db } = await import('@/lib/db');
        const { getAuthUser } = await import('./session');
        const user = await getAuthUser();
        if (!user) return { ok: false as const, error: 'Нужен вход' };

        const manageable = await getManageableMessage(db, data.messageId, user);
        if (!manageable.ok) return manageable;

        await db.chatMessage.delete({ where: { id: manageable.message.id } });
        return { ok: true as const, threadId: manageable.message.threadId };
    });

export const markChatThreadRead = createServerFn({ method: 'POST' })
    .validator(threadSchema)
    .handler(async ({ data }) => {
        const { db } = await import('@/lib/db');
        const { getAuthUser } = await import('./session');
        const user = await getAuthUser();
        if (!user) return { ok: false as const, error: 'Нужен вход' };
        if (!await getAccessibleThread(db, data.threadId, user.id)) {
            return { ok: false as const, error: 'Диалог не найден' };
        }

        await markRead(db, data.threadId, user.id);
        return { ok: true as const };
    });
