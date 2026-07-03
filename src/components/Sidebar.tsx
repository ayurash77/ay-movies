import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useRouter } from '@tanstack/react-router';
import {
    Bell,
    Bookmark,
    Check,
    MessageCircle,
    LayoutDashboard,
    Film,
    Home,
    LogOut,
    Palette,
    Plus,
    Search,
    Settings,
    ShieldCheck,
    UserRound,
    Users,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { signOut, type SessionUser } from '@/server/auth';
import { getSidebarCounts, type SidebarCounts } from '@/server/sidebar';

function initials(name: string) {
    const words = name.trim().split(/\s+/);
    const first = words[0]?.[0] ?? '?';
    const second = words[1]?.[0] ?? '';
    return (first + second).toUpperCase();
}

const navLinkClass =
    'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-4 [&_svg]:shrink-0';
const navLinkActive = 'bg-accent text-foreground font-medium';

const emptyCounts: SidebarCounts = {
    libraryTotal: 0,
    movies: 0,
    series: 0,
    cartoons: 0,
    myMovies: 0,
    friends: 0,
    watchlist: 0,
    watched: 0,
    unreadNotifications: 0,
    unreadChats: 0,
};

function NavCount({ value, tone = 'muted' }: { value: number; tone?: 'muted' | 'accent' }) {
    if (value <= 0) return null;
    return (
        <span className={cn(
            'ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
            tone === 'accent'
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-badge-foreground',
        )}>
            {value}
        </span>
    );
}

function AdminBadge({ role }: { role: SessionUser['role'] }) {
    if (role !== 'ADMIN') return null;
    return (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            <ShieldCheck className="size-3"/>
            admin
        </span>
    );
}

function UserAvatar({ user, className = 'size-8' }: { user: SessionUser; className?: string }) {
    return user.avatarUrl ? (
        <img src={user.avatarUrl} alt="" className={cn('shrink-0 rounded-full object-cover', className)}/>
    ) : (
        <span className={cn('flex shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground', className)}>
            {initials(user.name)}
        </span>
    );
}

export function Sidebar({
    user,
    onOpenTheme,
    onOpenProfile,
}: {
    user: SessionUser | null;
    onOpenTheme?: () => void;
    onOpenProfile?: () => void;
}) {
    const router = useRouter();
    const navigate = useNavigate();
    const { pathname, searchStr } = useLocation();
    const searchParams = new URLSearchParams(searchStr);
    const urlQuery = pathname === '/movies'
        ? searchParams.get('q') ?? ''
        : '';
    const urlKind = pathname === '/movies'
        ? searchParams.get('kind') ?? ''
        : '';
    const [ query, setQuery ] = useState(urlQuery);
    const [ counts, setCounts ] = useState<SidebarCounts>(emptyCounts);

    // Дебаунс: поиск из сайдбара ведёт в каталог с query в URL
    useEffect(() => {
        const handle = setTimeout(() => {
            const trimmed = query.trim();
            if (trimmed === urlQuery) return;
            if (!trimmed && pathname !== '/movies') return;
            navigate({
                to: '/movies',
                search: {
                    ...(trimmed ? { q: trimmed } : {}),
                    ...(urlKind ? { kind: urlKind as 'MOVIE' | 'SERIES' | 'CARTOON' } : {}),
                },
                replace: pathname === '/movies',
            });
        }, 300);
        return () => clearTimeout(handle);
    }, [ query, urlQuery, pathname, navigate ]);

    useEffect(() => {
        let cancelled = false;
        const refresh = async () => {
            const nextCounts = await getSidebarCounts();
            if (!cancelled) setCounts(nextCounts);
        };
        const handleChanged = () => {
            void refresh();
        };

        void refresh();
        const timer = window.setInterval(refresh, 12000);
        window.addEventListener('movienest:notifications-changed', handleChanged);
        window.addEventListener('movienest:chat-changed', handleChanged);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
            window.removeEventListener('movienest:notifications-changed', handleChanged);
            window.removeEventListener('movienest:chat-changed', handleChanged);
        };
    }, [ user, pathname ]);

    const handleSignOut = async () => {
        await signOut();
        await router.invalidate();
        navigate({ to: '/' });
    };

    const handleOpenProfile = () => {
        if (onOpenProfile) {
            onOpenProfile();
            return;
        }
        navigate({ to: '/profile' });
    };

    return (
        <div className="flex h-full min-h-0 flex-col gap-3 p-3 md:gap-4 md:p-4">
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1 md:gap-4">
                <Link to="/" className="flex items-center gap-2 px-1 text-lg font-bold tracking-tight">
                    <Film className="size-6 text-primary"/>
                    Movie<span className="text-primary">Nest</span>
                </Link>

                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/>
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Поиск фильмов…"
                        className="pl-8"
                        aria-label="Поиск фильмов"
                    />
                </div>

                <nav className="flex flex-col gap-1">
                    <Link
                        to="/"
                        className={navLinkClass}
                        activeProps={{ className: cn(navLinkClass, navLinkActive) }}
                        activeOptions={{ exact: true }}
                    >
                        <Home/>
                        Фильмотека
                        <NavCount value={counts.libraryTotal}/>
                    </Link>
                    <Link
                        to="/movies"
                        search={{ kind: 'MOVIE' }}
                        className={cn(navLinkClass, pathname === '/movies' && urlKind === 'MOVIE' && navLinkActive)}
                    >
                        <Film/>
                        Фильмы
                        <NavCount value={counts.movies}/>
                    </Link>
                    <Link
                        to="/movies"
                        search={{ kind: 'SERIES' }}
                        className={cn(navLinkClass, pathname === '/movies' && urlKind === 'SERIES' && navLinkActive)}
                    >
                        <Film/>
                        Сериалы
                        <NavCount value={counts.series}/>
                    </Link>
                    <Link
                        to="/movies"
                        search={{ kind: 'CARTOON' }}
                        className={cn(navLinkClass, pathname === '/movies' && urlKind === 'CARTOON' && navLinkActive)}
                    >
                        <Film/>
                        Мультфильмы
                        <NavCount value={counts.cartoons}/>
                    </Link>
                    {user ? (
                        <Link
                            to="/chat"
                            className={navLinkClass}
                            activeProps={{ className: cn(navLinkClass, navLinkActive) }}
                        >
                            <MessageCircle/>
                            <span className="min-w-0 flex-1 truncate">Чат</span>
                            <NavCount value={counts.unreadChats} tone="accent"/>
                        </Link>
                    ) : null}
                    {user ? (
                        <Link
                            to="/notifications"
                            className={navLinkClass}
                            activeProps={{ className: cn(navLinkClass, navLinkActive) }}
                        >
                            <Bell/>
                            <span className="min-w-0 flex-1 truncate">Уведомления</span>
                            <NavCount value={counts.unreadNotifications} tone="accent"/>
                        </Link>
                    ) : null}
                    {user ? (
                        <div className="mt-3 flex flex-col gap-1 border-t border-border pt-3">
                            <div className="px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Мои списки
                            </div>
                            <Link
                                to="/my"
                                className={cn(navLinkClass, pathname === '/my' && navLinkActive)}
                            >
                                <Bookmark/>
                                К просмотру
                                <NavCount value={counts.watchlist}/>
                            </Link>
                            <Link
                                to="/my"
                                className={navLinkClass}
                            >
                                <Check/>
                                Просмотрено
                                <NavCount value={counts.watched}/>
                            </Link>
                        </div>
                    ) : null}
                </nav>
            </div>

            <div className="flex shrink-0 flex-col gap-1 border-t border-border pt-3">
                {user ? (
                    <>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button size="sm" className="justify-start">
                                    <Plus/>
                                    Добавить
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-48">
                                <DropdownMenuItem onSelect={() => navigate({ to: '/movies/new', search: { kind: 'MOVIE' } })}>
                                    <Film/>
                                    Фильм
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => navigate({ to: '/movies/new', search: { kind: 'SERIES' } })}>
                                    <Film/>
                                    Сериал
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => navigate({ to: '/movies/new', search: { kind: 'CARTOON' } })}>
                                    <Film/>
                                    Мультфильм
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <div className="my-1 h-px bg-border"/>
                    </>
                ) : null}
                <button
                    type="button"
                    onClick={onOpenTheme}
                    className={cn(navLinkClass, 'w-full text-left')}
                >
                    <Palette/>
                    Оформление
                </button>
                {user ? (
                    <>
                        <Link
                            to="/settings"
                            className={navLinkClass}
                            activeProps={{ className: cn(navLinkClass, navLinkActive) }}
                        >
                            <Settings/>
                            Настройки
                        </Link>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent"
                                >
                                    <UserAvatar user={user}/>
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center gap-1.5">
                                            <span className="truncate text-sm font-medium">{user.name}</span>
                                            <AdminBadge role={user.role}/>
                                        </span>
                                        <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
                                    </span>
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent side="top" align="start" className="w-56">
                                <div className="flex items-center gap-2 px-1 py-1.5">
                                    <UserAvatar user={user}/>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                            <div className="truncate text-sm font-semibold">{user.name}</div>
                                            <AdminBadge role={user.role}/>
                                        </div>
                                        <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                                    </div>
                                </div>
                                <DropdownMenuSeparator/>
                                <DropdownMenuItem onSelect={handleOpenProfile}>
                                    <UserRound/>
                                    Открыть профиль
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => navigate({ to: '/friends' })}>
                                    <Users/>
                                    <span className="min-w-0 flex-1">Друзья</span>
                                    <NavCount value={counts.friends}/>
                                </DropdownMenuItem>
                                {user.role === 'ADMIN' ? (
                                    <DropdownMenuItem onSelect={() => navigate({ to: '/dashboard' })}>
                                        <LayoutDashboard/>
                                        Dashboard
                                    </DropdownMenuItem>
                                ) : null}
                                <DropdownMenuSeparator/>
                                <DropdownMenuItem
                                    onSelect={handleSignOut}
                                    className="text-destructive focus:text-destructive"
                                >
                                    <LogOut/>
                                    Выйти
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </>
                ) : (
                    <div className="flex flex-col gap-2">
                        <Button asChild size="sm">
                            <Link to="/sign-in">Войти</Link>
                        </Button>
                        <Button asChild variant="outline" size="sm">
                            <Link to="/sign-up">Регистрация</Link>
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
