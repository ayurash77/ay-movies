import { createFileRoute, Link, redirect, useNavigate, useRouter } from '@tanstack/react-router';
import { toast } from 'sonner';
import {
    ArrowLeft,
    Bell,
    BellOff,
    Bookmark,
    Check,
    Film,
    MessageCircle,
    MessageSquare,
    ShieldCheck,
    Star,
    UserPlus,
    UserRound,
    Users,
    X,
} from 'lucide-react';

import { PageTitle } from '@/components/AppTitle';
import { MovieGallery } from '@/components/movies/MovieGallery';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatRuDate } from '@/lib/date-format';
import { cn } from '@/lib/utils';
import {
    addFriend,
    followUser,
    getUserProfile,
    removeFriend,
    setUserRole,
    unfollowUser,
    type DashboardProfileData,
} from '@/server/dashboard';

export const Route = createFileRoute('/dashboard/$userId')({
    beforeLoad: ({ context, location }) => {
        if (!context.user) {
            throw redirect({ to: '/sign-in', search: { redirectTo: location.href } });
        }
    },
    loader: async ({ params }) => getUserProfile({ data: { userId: params.userId } }),
    component: UserProfilePage,
});

function initials(name: string) {
    const words = name.trim().split(/\s+/);
    return ((words[0]?.[0] ?? '?') + (words[1]?.[0] ?? '')).toUpperCase();
}

function StatTile({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
    return (
        <div className="flex items-center gap-3 rounded-lg border border-card-border bg-card p-4">
            <span className="text-primary [&_svg]:size-5">{icon}</span>
            <span>
                <span className="block text-xl font-bold leading-tight">{value}</span>
                <span className="block text-xs text-muted-foreground">{label}</span>
            </span>
        </div>
    );
}

function RoleBadge({ user }: { user: DashboardProfileData }) {
    return (
        <span
            className={cn(
                'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                user.role === 'ADMIN'
                    ? 'bg-primary/15 text-primary'
                    : 'bg-secondary text-badge-foreground',
            )}
        >
            {user.role === 'ADMIN' ? <ShieldCheck className="size-3"/> : <UserRound className="size-3"/>}
            {user.role === 'ADMIN' ? 'Администратор' : 'Пользователь'}
        </span>
    );
}

function UserProfilePage() {
    const result = Route.useLoaderData();
    const router = useRouter();
    const navigate = useNavigate();

    if (!result?.ok) {
        return (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
                <UserRound className="size-10 text-muted-foreground/60"/>
                <p className="text-sm text-muted-foreground">{result?.error ?? 'Пользователь не найден'}</p>
                <Button variant="outline" onClick={() => navigate({ to: '/friends' })}>
                    <ArrowLeft/>
                    К друзьям
                </Button>
            </div>
        );
    }

    const user = result.user;
    const joined = formatRuDate(user.createdAt);
    const backTo = user.canManage ? '/dashboard' : '/friends';
    const backLabel = user.canManage ? 'К Dashboard' : 'К друзьям';

    const toggleFriend = async () => {
        try {
            const response = user.isFriend
                ? await removeFriend({ data: { friendId: user.id } })
                : await addFriend({ data: { friendId: user.id } });
            if (response.ok) {
                toast.success(user.isFriend ? 'Удалён из друзей' : 'Добавлен в друзья');
                await router.invalidate();
            } else {
                toast.error(response.error);
            }
        } catch {
            toast.error('Не удалось обновить список друзей');
        }
    };

    const toggleFollow = async () => {
        try {
            const response = user.isFollowing
                ? await unfollowUser({ data: { userId: user.id } })
                : await followUser({ data: { userId: user.id } });
            if (response.ok) {
                toast.success(user.isFollowing ? 'Подписка отключена' : 'Подписка включена');
                await router.invalidate();
            } else {
                toast.error(response.error);
            }
        } catch {
            toast.error('Не удалось обновить подписку');
        }
    };

    const toggleRole = async () => {
        if (!user.canManage || user.isBootstrapAdmin) return;
        const role = user.role === 'ADMIN' ? 'USER' : 'ADMIN';
        try {
            const response = await setUserRole({ data: { userId: user.id, role } });
            if (response.ok) {
                toast.success(role === 'ADMIN' ? 'Администратор включён' : 'Роль пользователя включена');
                await router.invalidate();
            } else {
                toast.error(response.error);
            }
        } catch {
            toast.error('Не удалось изменить роль');
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <PageTitle title={user.name}/>
            <Button variant="ghost" size="sm" className="w-fit -ml-2" onClick={() => navigate({ to: backTo })}>
                <ArrowLeft/>
                {backLabel}
            </Button>

            <Card>
                <CardHeader className="flex-row items-center gap-4">
                    {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt="" className="size-16 shrink-0 rounded-full object-cover"/>
                    ) : (
                        <span className="grid size-16 shrink-0 place-items-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
                            {initials(user.name)}
                        </span>
                    )}
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="truncate text-xl">{user.name}</CardTitle>
                            <RoleBadge user={user}/>
                        </div>
                        <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                        <p className="text-xs text-muted-foreground">На сайте с {joined}</p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                        {!user.isSelf ? (
                            <>
                                <Button variant="outline" size="sm" onClick={toggleFriend}>
                                    {user.isFriend ? <X/> : <UserPlus/>}
                                    {user.isFriend ? 'Убрать' : 'В друзья'}
                                </Button>
                                <Button variant={user.isFollowing ? 'default' : 'outline'} size="sm" onClick={toggleFollow}>
                                    {user.isFollowing ? <BellOff/> : <Bell/>}
                                    {user.isFollowing ? 'Отписаться' : 'Подписаться'}
                                </Button>
                                {user.isFriend ? (
                                    <Button asChild variant="outline" size="sm">
                                        <Link to="/chat" search={{ user: user.id }}>
                                            <MessageCircle/>
                                            Написать
                                        </Link>
                                    </Button>
                                ) : null}
                            </>
                        ) : null}
                        {user.canManage ? (
                            <Button
                                variant={user.role === 'ADMIN' ? 'default' : 'outline'}
                                size="sm"
                                disabled={user.isBootstrapAdmin}
                                onClick={toggleRole}
                            >
                                <ShieldCheck/>
                                {user.role === 'ADMIN' ? 'Сделать user' : 'Сделать admin'}
                            </Button>
                        ) : null}
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
                        <StatTile icon={<Film/>} value={user.movieCount} label="Фильмов"/>
                        <StatTile icon={<Star/>} value={user.ratingCount} label="Оценок"/>
                        <StatTile icon={<MessageSquare/>} value={user.commentCount} label="Комментариев"/>
                        <StatTile icon={<Bookmark/>} value={user.watchlistCount} label="К просмотру"/>
                        <StatTile icon={<Check/>} value={user.watchedCount} label="Просмотрено"/>
                        <StatTile icon={<Users/>} value={user.friendCount} label="Друзей"/>
                        <StatTile icon={<Bell/>} value={user.followerCount} label="Подписчиков"/>
                        <StatTile icon={<Bell/>} value={user.followingCount} label="Подписок"/>
                    </div>
                </CardContent>
            </Card>

            <MovieGallery
                movies={user.movies}
                emptyText="Пользователь ещё не добавил ни одного фильма"
                controlsStart={(
                    <div className="flex items-center gap-2">
                        <Film className="size-5 text-primary"/>
                        <h2 className="text-xl font-bold tracking-tight">Фильмы пользователя</h2>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs tabular-nums text-badge-foreground">
                            {user.movies.length}
                        </span>
                    </div>
                )}
            />
        </div>
    );
}
