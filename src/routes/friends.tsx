import { useEffect, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Loader2, MessageCircle, Plus, Search, ShieldCheck, Trash2, UserPlus, Users, X } from 'lucide-react';

import { PageTitle } from '@/components/AppTitle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
    addFriend,
    getDashboardData,
    removeFriend,
    searchUsersForFriends,
    type DashboardFriendCard,
    type DashboardUserCard,
} from '@/server/dashboard';

export const Route = createFileRoute('/friends')({
    beforeLoad: ({ context, location }) => {
        if (!context.user) {
            throw redirect({ to: '/sign-in', search: { redirectTo: location.href } });
        }
    },
    loader: async () => getDashboardData(),
    component: FriendsPage,
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

function FriendsPage() {
    const data = Route.useLoaderData();
    const router = useRouter();
    const friends = data?.friends ?? [];
    const [ removingFriendId, setRemovingFriendId ] = useState<string | null>(null);

    const handleRemoveFriend = async (friendId: string) => {
        setRemovingFriendId(friendId);
        try {
            const result = await removeFriend({ data: { friendId } });
            if (result.ok) {
                toast.success('Удалён из друзей');
                await router.invalidate();
            } else {
                toast.error(result.error);
            }
        } catch {
            toast.error('Не удалось удалить из друзей');
        } finally {
            setRemovingFriendId(null);
        }
    };

    return (
        <div className="flex flex-col gap-5">
            <PageTitle title="Друзья"/>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Users className="size-5 text-primary"/>
                    <h2 className="text-xl font-bold tracking-tight">Друзья</h2>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs tabular-nums text-badge-foreground">
                        {friends.length}
                    </span>
                </div>
                <AddFriendDialog onAdded={() => router.invalidate()}/>
            </div>

            {friends.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">Добавьте пользователей в друзья.</p>
            ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {friends.map((friend) => (
                        <FriendCard
                            key={friend.friendshipId}
                            user={friend}
                            busy={removingFriendId === friend.id}
                            onRemove={handleRemoveFriend}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function FriendCard({ user, busy, onRemove }: {
    user: DashboardFriendCard;
    busy: boolean;
    onRemove: (friendId: string) => void;
}) {
    return (
        <div className="flex items-center gap-3 rounded-lg border border-card-border bg-card p-3">
            <Avatar user={user}/>
            <Link to="/dashboard/$userId" params={{ userId: user.id }} className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold hover:text-primary">{user.name}</span>
                    <RoleBadge role={user.role}/>
                </div>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                <p className="mt-1 text-[11px] text-muted-foreground/80">
                    Фильмов: {user.movieCount} · Оценок: {user.ratingCount}
                </p>
            </Link>
            <Button asChild variant="ghost" size="icon" className="size-8" aria-label="Написать">
                <Link to="/chat" search={{ user: user.id }}>
                    <MessageCircle/>
                </Link>
            </Button>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 text-destructive hover:text-destructive"
                disabled={busy}
                onClick={() => onRemove(user.id)}
                aria-label="Удалить из друзей"
            >
                {busy ? <Loader2 className="animate-spin"/> : <Trash2/>}
            </Button>
        </div>
    );
}

function AddFriendDialog({ onAdded }: { onAdded: () => void | Promise<void> }) {
    const [ open, setOpen ] = useState(false);
    const [ query, setQuery ] = useState('');
    const [ results, setResults ] = useState<DashboardUserCard[]>([]);
    const [ loading, setLoading ] = useState(false);
    const [ addingId, setAddingId ] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoading(true);
        const handle = setTimeout(async () => {
            try {
                const list = await searchUsersForFriends({ data: { q: query.trim() || undefined } });
                if (!cancelled) setResults(list);
            } catch {
                if (!cancelled) setResults([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }, 250);
        return () => {
            cancelled = true;
            clearTimeout(handle);
        };
    }, [ query, open ]);

    const handleAdd = async (user: DashboardUserCard) => {
        if (addingId) return;
        setAddingId(user.id);
        try {
            const result = await addFriend({ data: { friendId: user.id } });
            if (result.ok) {
                toast.success(result.already ? 'Уже в друзьях' : 'Добавлен в друзья');
                await onAdded();
                setResults((items) => items.map((item) => item.id === user.id ? { ...item, isFriend: true } : item));
            } else {
                toast.error(result.error);
            }
        } catch {
            toast.error('Не удалось добавить в друзья');
        } finally {
            setAddingId(null);
        }
    };

    return (
        <DialogPrimitive.Root
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (next) {
                    setQuery('');
                    setResults([]);
                }
            }}
        >
            <DialogPrimitive.Trigger asChild>
                <Button size="sm">
                    <UserPlus/>
                    Добавить
                </Button>
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in-0"/>
                <DialogPrimitive.Content className="fixed left-1/2 top-[8vh] z-50 flex max-h-[84vh] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 flex-col gap-3 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-[0_22px_64px_rgba(0,0,0,0.52)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
                    <div className="flex items-start justify-between gap-4">
                        <DialogPrimitive.Title className="text-base font-semibold">Добавить друга</DialogPrimitive.Title>
                        <DialogPrimitive.Description className="sr-only">
                            Найдите пользователя и добавьте его в друзья.
                        </DialogPrimitive.Description>
                        <DialogPrimitive.Close asChild>
                            <Button variant="ghost" size="icon" className="size-8.5" aria-label="Закрыть">
                                <X className="size-4"/>
                            </Button>
                        </DialogPrimitive.Close>
                    </div>

                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/>
                        <Input
                            autoFocus
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Поиск пользователей…"
                            className="h-9 pl-8 pr-8"
                        />
                        {query ? (
                            <button
                                type="button"
                                onClick={() => setQuery('')}
                                aria-label="Сбросить поиск"
                                className="absolute right-2 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            >
                                <X className="size-3.5"/>
                            </button>
                        ) : null}
                    </div>

                    <div className="-mr-1 min-h-0 flex-1 overflow-y-auto pr-1">
                        {loading ? (
                            <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
                                <Loader2 className="size-4 animate-spin"/>
                                Поиск…
                            </div>
                        ) : results.length === 0 ? (
                            <div className="px-2 py-3 text-xs text-muted-foreground">
                                {query.trim() ? 'Ничего не найдено' : 'Начните вводить имя или email'}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-0.5">
                                {results.map((user) => (
                                    <button
                                        key={user.id}
                                        type="button"
                                        onClick={() => user.isFriend ? undefined : void handleAdd(user)}
                                        disabled={addingId !== null || user.isFriend}
                                        className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-accent disabled:opacity-60"
                                    >
                                        <Avatar user={user} className="size-10"/>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                                <span className="truncate text-sm font-medium">{user.name}</span>
                                                <RoleBadge role={user.role}/>
                                            </div>
                                            <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                                        </div>
                                        {addingId === user.id ? (
                                            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground"/>
                                        ) : user.isFriend ? (
                                            <span className="shrink-0 text-xs text-muted-foreground">В друзьях</span>
                                        ) : (
                                            <Plus className="size-4 shrink-0 text-muted-foreground"/>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}
