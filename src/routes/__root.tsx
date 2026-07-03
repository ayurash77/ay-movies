import { useEffect, useState } from 'react';
import { createRootRoute, HeadContent, Link, Outlet, Scripts, useLocation } from '@tanstack/react-router';
import { ArrowLeft, Film, Menu, Plus } from 'lucide-react';
import { Toaster } from 'sonner';

import appCss from '../styles.css?url';
import { AppTitleProvider, useAppTitle } from '@/components/AppTitle';
import { ProfileDialog } from '@/components/ProfileDialog';
import { Sidebar } from '@/components/Sidebar';
import { ThemeDialog } from '@/components/ThemeDialog';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { getSessionUser } from '@/server/auth';
import { movieKindOptions, type MovieKind } from '@/lib/movie-data';
import { applyTheme, getStoredTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

export const Route = createRootRoute({
    head: () => ({
        meta: [
            { charSet: 'utf-8' },
            { name: 'viewport', content: 'width=device-width, initial-scale=1' },
            { title: 'MovieNest — библиотека фильмов' },
        ],
        links: [
            { rel: 'stylesheet', href: appCss },
            { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
        ],
    }),
    beforeLoad: async () => {
        const user = await getSessionUser();
        return { user };
    },
    shellComponent: RootDocument,
    component: RootComponent,
});

function RootComponent() {
    return (
        <AppTitleProvider>
            <RootLayout/>
        </AppTitleProvider>
    );
}

function RootLayout() {
    const { user } = Route.useRouteContext();
    const { pathname, searchStr } = useLocation();
    const appTitle = useAppTitle();
    const [ isMobileMenuOpen, setIsMobileMenuOpen ] = useState(false);
    const [ isProfileOpen, setIsProfileOpen ] = useState(false);
    const [ isThemeOpen, setIsThemeOpen ] = useState(false);
    const isChatRoute = pathname.startsWith('/chat');
    const searchParams = new URLSearchParams(searchStr);
    const rawMovieKind = searchParams.get('kind');
    const addMovieKind = pathname === '/movies' && movieKindOptions.includes(rawMovieKind as MovieKind)
        ? rawMovieKind as MovieKind
        : null;
    const showHeaderAdd = Boolean(user && (pathname === '/' || pathname === '/movies'));

    useEffect(() => {
        applyTheme(getStoredTheme(user?.id ?? null));
    }, [ user?.id ]);

    // Закрываем мобильное меню при переходе на другую страницу
    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [ pathname ]);

    const mobileMenu = (
        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Открыть меню">
                    <Menu/>
                </Button>
            </SheetTrigger>
            <SheetContent>
                <Sidebar
                    user={user}
                    onOpenProfile={() => {
                        setIsMobileMenuOpen(false);
                        setIsProfileOpen(true);
                    }}
                    onOpenTheme={() => {
                        setIsMobileMenuOpen(false);
                        setIsThemeOpen(true);
                    }}
                />
            </SheetContent>
        </Sheet>
    );

    const headerAddButton = !showHeaderAdd ? null : addMovieKind ? (
        <Button asChild size="icon" className="ml-auto" aria-label="Добавить">
            <Link to="/movies/new" search={{ kind: addMovieKind }}>
                <Plus/>
            </Link>
        </Button>
    ) : (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button size="icon" className="ml-auto" aria-label="Добавить">
                    <Plus/>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                    <Link to="/movies/new" search={{ kind: 'MOVIE' }}>
                        <Film/>
                        Фильм
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                    <Link to="/movies/new" search={{ kind: 'SERIES' }}>
                        <Film/>
                        Сериал
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                    <Link to="/movies/new" search={{ kind: 'CARTOON' }}>
                        <Film/>
                        Мультфильм
                    </Link>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );

    return (
        <div className={cn('flex bg-background', isChatRoute ? 'h-svh overflow-hidden' : 'min-h-svh')}>
            <aside className="sticky top-0 hidden h-svh w-60 shrink-0 border-r border-border bg-background shadow-[10px_0_30px_rgb(0_0_0/0.18)] md:block">
                <Sidebar
                    user={user}
                    onOpenProfile={() => setIsProfileOpen(true)}
                    onOpenTheme={() => setIsThemeOpen(true)}
                />
            </aside>

            <div className={cn('flex min-w-0 flex-1 flex-col bg-surface', isChatRoute && 'h-svh min-h-0 overflow-hidden')}>
                <header
                    className={cn(
                        'sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 shadow-[0_12px_30px_rgb(0_0_0/0.24)] backdrop-blur-md',
                        isChatRoute ? 'bg-background/75' : 'bg-background/90',
                    )}
                >
                    {mobileMenu}
                    {appTitle?.mobileBackTo ? (
                        <Button asChild variant="ghost" size="icon" className="md:hidden" aria-label="Назад">
                            <Link to={appTitle.mobileBackTo}>
                                <ArrowLeft/>
                            </Link>
                        </Button>
                    ) : null}
                    {appTitle ? (
                        <div className="min-w-0 truncate text-lg font-semibold tracking-tight">
                            {appTitle.title}
                        </div>
                    ) : (
                        <Link to="/" className="flex items-center gap-2 text-base font-bold tracking-tight">
                            <Film className="size-5 text-primary"/>
                            <>
                                Movie<span className="text-primary">Nest</span>
                            </>
                        </Link>
                    )}
                    {headerAddButton}
                </header>

                <main className={isChatRoute ? 'mx-auto flex h-[calc(100svh-3.5rem)] min-h-0 w-full max-w-6xl flex-1 overflow-hidden px-3 py-0 md:px-4 md:py-5' : 'mx-auto w-full max-w-6xl flex-1 px-4 py-5'}>
                    <Outlet/>
                </main>
                {!isChatRoute ? (
                    <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
                        MovieNest — ваша библиотека фильмов
                    </footer>
                ) : null}
            </div>
            <ProfileDialog open={isProfileOpen} onOpenChange={setIsProfileOpen} user={user}/>
            <ThemeDialog open={isThemeOpen} onOpenChange={setIsThemeOpen} userId={user?.id ?? null}/>
            <Toaster theme="dark" position="bottom-right"/>
        </div>
    );
}

function RootDocument({ children }: { children: React.ReactNode }) {
    return (
        <html lang="ru" className="dark" suppressHydrationWarning>
            <head>
                <HeadContent/>
            </head>
            <body>
                <script
                    dangerouslySetInnerHTML={{
                        __html: "try{const t=localStorage.getItem('movienest:theme');document.documentElement.dataset.theme=['ayu','catppuccin','onedark','shotmate'].includes(t)?t:'ayu';}catch{document.documentElement.dataset.theme='ayu'}",
                    }}
                />
                {children}
                <Scripts/>
            </body>
        </html>
    );
}
