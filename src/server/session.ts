import { randomBytes } from 'node:crypto';
import { deleteCookie, getCookie, setCookie } from '@tanstack/react-start/server';

import { db } from '@/lib/db';
import { toServedUploadUrl } from '@/lib/upload-url';
import { resolveRole, type UserRole } from '@/lib/user-roles';

const SESSION_COOKIE = 'ay_movies_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type SessionUser = {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    role: UserRole;
};

export async function createSession(userId: string) {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await db.session.create({ data: { id: token, userId, expiresAt } });

    setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_TTL_MS / 1000,
    });
}

export async function destroySession() {
    const token = getCookie(SESSION_COOKIE);
    if (token) {
        await db.session.delete({ where: { id: token } }).catch(() => undefined);
    }
    deleteCookie(SESSION_COOKIE, { path: '/' });
}

export async function getAuthUser(): Promise<SessionUser | null> {
    const token = getCookie(SESSION_COOKIE);
    if (!token) return null;

    const session = await db.session.findUnique({
        where: { id: token },
        include: { user: true },
    });

    if (!session) return null;

    if (session.expiresAt.getTime() < Date.now()) {
        await db.session.delete({ where: { id: token } }).catch(() => undefined);
        return null;
    }

    return {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        avatarUrl: toServedUploadUrl(session.user.avatarUrl),
        role: resolveRole(session.user.email, session.user.role),
    };
}
