import { useState } from 'react';
import { createFileRoute, redirect, useNavigate, useRouter } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Loader2, ShieldCheck, Users } from 'lucide-react';

import { PageTitle } from '@/components/AppTitle';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
    getDashboardData,
    setUserRole,
    type AdminUserCard,
    type DashboardUserCard,
} from '@/server/dashboard';

export const Route = createFileRoute('/dashboard/')({
    beforeLoad: ({ context, location }) => {
        if (!context.user) {
            throw redirect({ to: '/sign-in', search: { redirectTo: location.href } });
        }
        if (context.user.role !== 'ADMIN') {
            throw redirect({ to: '/' });
        }
    },
    loader: async () => getDashboardData(),
    component: DashboardPage,
});

function initials(name: string) {
    const words = name.trim().split(/\s+/);
    return ((words[0]?.[0] ?? '?') + (words[1]?.[0] ?? '')).toUpperCase();
}

function Avatar({ user, className = 'size-12' }: { user: { name: string; avatarUrl: string | null }; className?: string }) {
    return user.avatarUrl ? (
        <img src={user.avatarUrl} alt="" className={cn('shrink-0 rounded-full object-cover', className)}/>
    ) : (
        <span className={cn('grid shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground', className)}>
            {initials(user.name)}
        </span>
    );
}

function RoleBadge({ role }: { role: DashboardUserCard['role'] }) {
    if (role !== 'ADMIN') return null;
    return (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            <ShieldCheck className="size-3"/>
            admin
        </span>
    );
}

function DashboardPage() {
    const data = Route.useLoaderData();
    const router = useRouter();
    const users = data?.users ?? [];
    const canManageUsers = data?.canManageUsers ?? false;
    const [ busyUserId, setBusyUserId ] = useState<string | null>(null);

    const handleSetRole = async (user: AdminUserCard, role: 'USER' | 'ADMIN') => {
        if (busyUserId || user.role === role || user.isBootstrapAdmin) return;
        setBusyUserId(user.id);
        try {
            const result = await setUserRole({ data: { userId: user.id, role } });
            if (result.ok) {
                toast.success(role === 'ADMIN' ? 'Администратор включён' : 'Роль пользователя включена');
                await router.invalidate();
            } else {
                toast.error(result.error);
            }
        } catch {
            toast.error('Не удалось изменить роль');
        } finally {
            setBusyUserId(null);
        }
    };

    return (
        <div className="flex flex-col gap-5">
            <PageTitle title="Dashboard"/>

            <div className="flex items-center gap-2">
                <Users className="size-5 text-primary"/>
                <h2 className="text-xl font-bold tracking-tight">Пользователи</h2>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs tabular-nums text-badge-foreground">
                    {users.length}
                </span>
            </div>

            {users.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">Пользователей пока нет.</p>
            ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {users.map((user) => (
                        <AdminUserCardView
                            key={user.id}
                            user={user}
                            roleBusy={busyUserId === user.id}
                            canManageRoles={canManageUsers}
                            onSetRole={handleSetRole}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function AdminUserCardView({ user, roleBusy, canManageRoles, onSetRole }: {
    user: AdminUserCard;
    roleBusy: boolean;
    canManageRoles: boolean;
    onSetRole: (user: AdminUserCard, role: 'USER' | 'ADMIN') => void;
}) {
    const navigate = useNavigate();
    const canChange = canManageRoles && !user.isBootstrapAdmin;
    const goToProfile = () => navigate({ to: '/dashboard/$userId', params: { userId: user.id } });
    const shouldIgnoreCardClick = (target: EventTarget | null) =>
        target instanceof HTMLElement && Boolean(target.closest('button,a'));

    return (
        <div
            role="link"
            tabIndex={0}
            onClick={(event) => {
                if (!shouldIgnoreCardClick(event.target)) goToProfile();
            }}
            onKeyDown={(event) => {
                if (shouldIgnoreCardClick(event.target)) return;
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    goToProfile();
                }
            }}
            className="group flex cursor-pointer flex-col gap-2 rounded-lg border border-card-border bg-card p-3 transition-all hover:-translate-y-0.5 hover:border-card-border-active hover:bg-card-active hover:shadow-lg hover:shadow-primary/10 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
            <div className="flex min-w-0 items-center gap-3">
                <Avatar user={user}/>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold group-hover:text-primary">{user.name}</span>
                        <RoleBadge role={user.role}/>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground/80">
                        Фильмов: {user.movieCount} · Оценок: {user.ratingCount} · Комментариев: {user.commentCount}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                        {user.isSelf ? 'Это вы' : user.isFriend ? 'В друзьях' : 'Не в друзьях'} · {user.isFollowing ? 'Вы подписаны' : 'Без подписки'}
                    </p>
                </div>
            </div>
            {canManageRoles ? (
                <div className="flex justify-end border-t border-border/70 pt-2">
                    <Button
                        type="button"
                        variant={user.role === 'ADMIN' ? 'default' : 'outline'}
                        size="sm"
                        className="h-7"
                        disabled={!canChange || roleBusy}
                        onClick={() => onSetRole(user, user.role === 'ADMIN' ? 'USER' : 'ADMIN')}
                    >
                        {roleBusy ? <Loader2 className="animate-spin"/> : <ShieldCheck/>}
                        {user.role === 'ADMIN' ? 'Сделать user' : 'Сделать admin'}
                    </Button>
                </div>
            ) : null}
        </div>
    );
}
