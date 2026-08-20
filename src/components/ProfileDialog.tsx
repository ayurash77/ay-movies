import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useRouter } from '@tanstack/react-router';
import { toast } from 'sonner';
import {
    Bookmark,
    CalendarDays,
    Check,
    Film,
    ImageUp,
    KeyRound,
    Loader2,
    MessageSquare,
    ShieldCheck,
    Star,
    UserRound,
    X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatRuDate } from '@/lib/date-format';
import { cn } from '@/lib/utils';
import type { SessionUser } from '@/server/auth';
import { getUserProfile } from '@/server/dashboard';
import { changePassword, getMyProfile, type MyProfile, updateName, uploadMyAvatar } from '@/server/profile';

type ProfileDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    user: SessionUser | null;
    profileUserId?: string | null;
};

function initials(name: string) {
    const words = name.trim().split(/\s+/);
    return ((words[0]?.[0] ?? '?') + (words[1]?.[0] ?? '')).toUpperCase();
}

function StatTile({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
    return (
        <div className="flex min-h-16 items-center gap-2.5 rounded-md border border-card-border bg-card px-3 py-2 shadow-[0_10px_24px_rgb(0_0_0/0.16)]">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/12 text-primary [&_svg]:size-4">{icon}</span>
            <span className="min-w-0">
                <span className="block text-lg font-bold leading-tight tabular-nums">{value}</span>
                <span className="block text-[11px] leading-snug text-muted-foreground">{label}</span>
            </span>
        </div>
    );
}

function RoleBadge({ role }: { role: string }) {
    if (role !== 'ADMIN') return null;
    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-1 text-xs font-medium text-primary">
            <ShieldCheck className="size-3.5"/>
            admin
        </span>
    );
}

export function profileDialogFallback(user: SessionUser, isOwnProfile: boolean): MyProfile | null {
    if (!isOwnProfile) return null;
    return {
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        role: user.role,
        createdAt: new Date().toISOString(),
        moviesAdded: 0,
        ratingsCount: 0,
        commentsCount: 0,
        watchlistCount: 0,
        watchedCount: 0,
    };
}

type LatestProfileRequestCallbacks<T> = {
    onStart?: () => void;
    onSuccess: (value: T) => void;
    onError?: (error: unknown) => void;
    onSettled?: () => void;
};

export function createLatestProfileRequestController() {
    let sequence = 0;

    return {
        async run<T>(request: () => Promise<T>, callbacks: LatestProfileRequestCallbacks<T>) {
            const requestSequence = ++sequence;
            callbacks.onStart?.();
            try {
                const value = await request();
                if (requestSequence !== sequence) return false;
                callbacks.onSuccess(value);
                return true;
            } catch (error) {
                if (requestSequence !== sequence) return false;
                callbacks.onError?.(error);
                return false;
            } finally {
                if (requestSequence === sequence) callbacks.onSettled?.();
            }
        },
        cancel() {
            sequence += 1;
        },
    };
}

export function ProfileDialog({ open, onOpenChange, user, profileUserId }: ProfileDialogProps) {
    const router = useRouter();
    const fileRef = useRef<HTMLInputElement>(null);
    const profileRequest = useRef(createLatestProfileRequestController()).current;
    const [ profile, setProfile ] = useState<MyProfile | null>(null);
    const [ profileError, setProfileError ] = useState<string | null>(null);
    const [ isLoading, setIsLoading ] = useState(false);
    const [ name, setName ] = useState('');
    const [ currentPassword, setCurrentPassword ] = useState('');
    const [ newPassword, setNewPassword ] = useState('');
    const [ confirmPassword, setConfirmPassword ] = useState('');
    const [ avatarBusy, setAvatarBusy ] = useState(false);
    const [ nameBusy, setNameBusy ] = useState(false);
    const [ passwordBusy, setPasswordBusy ] = useState(false);
    const isOwnProfile = !profileUserId || profileUserId === user?.id;

    const loadProfile = () => profileRequest.run(
        async () => (
            isOwnProfile
                ? await getMyProfile()
                : await getUserProfile({ data: { userId: profileUserId } }).then((result): MyProfile | null => {
                    if (!result.ok) throw new Error(result.error);
                    return {
                        name: result.user.name,
                        email: result.user.email,
                        avatarUrl: result.user.avatarUrl,
                        role: result.user.role,
                        createdAt: result.user.createdAt,
                        moviesAdded: result.user.movieCount,
                        ratingsCount: result.user.ratingCount,
                        commentsCount: result.user.commentCount,
                        watchlistCount: result.user.watchlistCount,
                        watchedCount: result.user.watchedCount,
                    };
                })
        ),
        {
            onStart: () => {
                setIsLoading(true);
                setProfileError(null);
            },
            onSuccess: (nextProfile) => {
                setProfile(nextProfile);
                setName(nextProfile?.name ?? user?.name ?? '');
            },
            onError: () => {
                const error = 'Не удалось загрузить профиль';
                setProfileError(error);
                toast.error(error);
            },
            onSettled: () => setIsLoading(false),
        },
    );

    useEffect(() => {
        if (!open || !user) {
            profileRequest.cancel();
            return;
        }
        setProfile(null);
        setProfileError(null);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        void loadProfile();
        return () => profileRequest.cancel();
    }, [ open, profileUserId, user?.id ]);

    if (!user) return null;

    const visibleProfile = profile ?? profileDialogFallback(user, isOwnProfile);
    const joined = visibleProfile ? formatRuDate(visibleProfile.createdAt) : '';

    const refreshAfterChange = async () => {
        await router.invalidate();
        await loadProfile();
    };

    const handleAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file || avatarBusy) return;

        const form = new FormData();
        form.set('file', file);
        setAvatarBusy(true);
        try {
            const result = await uploadMyAvatar({ data: form });
            if (result.ok) {
                toast.success('Фото профиля обновлено');
                await refreshAfterChange();
            } else {
                toast.error(result.error);
            }
        } catch {
            toast.error('Не удалось загрузить фото');
        } finally {
            setAvatarBusy(false);
        }
    };

    const handleName = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const nextName = name.trim();
        if (!visibleProfile || !nextName || nextName === visibleProfile.name || nameBusy) return;

        setNameBusy(true);
        try {
            const result = await updateName({ data: { name: nextName } });
            if (result.ok) {
                toast.success('Имя обновлено');
                await refreshAfterChange();
            } else {
                toast.error(result.error);
            }
        } finally {
            setNameBusy(false);
        }
    };

    const handlePassword = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (newPassword !== confirmPassword) {
            toast.error('Пароли не совпадают');
            return;
        }

        setPasswordBusy(true);
        try {
            const result = await changePassword({ data: { current: currentPassword, next: newPassword } });
            if (result.ok) {
                toast.success('Пароль изменён');
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
            } else {
                toast.error(result.error);
            }
        } catch {
            toast.error('Пароль должен быть не короче 6 символов');
        } finally {
            setPasswordBusy(false);
        }
    };

    return (
        <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0"/>
                <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100svh-2rem)] w-[calc(100vw-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-[0_22px_64px_rgba(0,0,0,0.52)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
                    <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
                        <div>
                            <DialogPrimitive.Title className="flex items-center gap-2 text-base font-semibold">
                                <UserRound className="size-4 text-primary"/>
                                Профиль
                            </DialogPrimitive.Title>
                            <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                                {isOwnProfile ? 'Ваши данные' : 'Данные пользователя'}
                            </DialogPrimitive.Description>
                        </div>
                        <DialogPrimitive.Close asChild>
                            <Button variant="ghost" size="icon" aria-label="Закрыть">
                                <X className="size-4"/>
                            </Button>
                        </DialogPrimitive.Close>
                    </div>

                    <div className="min-h-0 overflow-y-auto px-5 py-5">
                        {isLoading && !profile ? (
                            <div className="grid min-h-60 place-items-center text-sm text-muted-foreground">
                                <span className="flex items-center gap-2">
                                    <Loader2 className="size-4 animate-spin"/>
                                    Загрузка профиля...
                                </span>
                            </div>
                        ) : !visibleProfile ? (
                            <div className="grid min-h-60 place-items-center text-sm text-muted-foreground">
                                {profileError ?? 'Профиль недоступен'}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-5">
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (isOwnProfile) fileRef.current?.click();
                                        }}
                                        disabled={!isOwnProfile || avatarBusy}
                                        className="group relative size-24 shrink-0 overflow-hidden rounded-full border-4 border-card bg-card shadow-[0_18px_44px_rgb(0_0_0/0.32)]"
                                        aria-label={isOwnProfile ? 'Сменить фото профиля' : `Фото профиля ${visibleProfile.name}`}
                                    >
                                        {visibleProfile.avatarUrl ? (
                                            <img src={visibleProfile.avatarUrl} alt="" className="size-full object-cover"/>
                                        ) : (
                                            <span className="grid size-full place-items-center bg-primary text-2xl font-bold text-primary-foreground">
                                                {initials(visibleProfile.name)}
                                            </span>
                                        )}
                                        {isOwnProfile ? (
                                            <span
                                                className={cn(
                                                    'absolute inset-0 grid place-items-center bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100',
                                                    avatarBusy && 'opacity-100',
                                                )}
                                            >
                                                {avatarBusy ? <Loader2 className="size-5 animate-spin"/> : <ImageUp className="size-5"/>}
                                            </span>
                                        ) : null}
                                    </button>
                                    <input
                                        ref={fileRef}
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp"
                                        className="hidden"
                                        onChange={handleAvatar}
                                    />

                                    <div className="min-w-0 pb-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h2 className="truncate text-2xl font-bold tracking-tight">{visibleProfile.name}</h2>
                                            <RoleBadge role={visibleProfile.role}/>
                                        </div>
                                        <p className="truncate text-sm text-muted-foreground">{visibleProfile.email}</p>
                                        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                                            <CalendarDays className="size-3.5"/>
                                            На сайте с {joined}
                                        </p>
                                        {isOwnProfile ? (
                                            <p className="mt-1 text-[11px] text-muted-foreground/75">
                                                Нажмите на фото, чтобы заменить. JPEG, PNG или WebP до 5 МБ.
                                            </p>
                                        ) : null}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                                    <StatTile icon={<Film/>} value={visibleProfile.moviesAdded} label="Добавлено"/>
                                    <StatTile icon={<Star/>} value={visibleProfile.ratingsCount} label="Оценок"/>
                                    <StatTile icon={<MessageSquare/>} value={visibleProfile.commentsCount} label="Рецензий"/>
                                    <StatTile icon={<Bookmark/>} value={visibleProfile.watchlistCount} label="К просмотру"/>
                                    <StatTile icon={<Check/>} value={visibleProfile.watchedCount} label="Просмотрено"/>
                                </div>

                                {isOwnProfile ? (
                                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                                    <form onSubmit={handleName} className="flex flex-col gap-3 rounded-md border border-card-border bg-card p-4">
                                        <div>
                                            <h3 className="text-sm font-semibold">Данные профиля</h3>
                                            <p className="mt-1 text-xs text-muted-foreground">Имя отображается в рецензиях и карточках.</p>
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <Label htmlFor="profile-dialog-name">Имя</Label>
                                            <Input
                                                id="profile-dialog-name"
                                                value={name}
                                                onChange={(event) => setName(event.target.value)}
                                                maxLength={100}
                                                placeholder="Ваше имя"
                                            />
                                        </div>
                                        <Button type="submit" className="self-start" disabled={nameBusy || !name.trim() || name.trim() === visibleProfile.name}>
                                            {nameBusy ? <Loader2 className="animate-spin"/> : null}
                                            Сохранить
                                        </Button>
                                    </form>

                                    <form onSubmit={handlePassword} className="flex flex-col gap-3 rounded-md border border-card-border bg-card p-4">
                                        <div>
                                            <h3 className="flex items-center gap-2 text-sm font-semibold">
                                                <KeyRound className="size-4 text-primary"/>
                                                Пароль
                                            </h3>
                                            <p className="mt-1 text-xs text-muted-foreground">Минимум 6 символов.</p>
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <Label htmlFor="profile-dialog-current-password">Текущий пароль</Label>
                                            <Input
                                                id="profile-dialog-current-password"
                                                type="password"
                                                value={currentPassword}
                                                onChange={(event) => setCurrentPassword(event.target.value)}
                                                autoComplete="current-password"
                                            />
                                        </div>
                                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                                            <div className="flex flex-col gap-2">
                                                <Label htmlFor="profile-dialog-new-password">Новый пароль</Label>
                                                <Input
                                                    id="profile-dialog-new-password"
                                                    type="password"
                                                    value={newPassword}
                                                    onChange={(event) => setNewPassword(event.target.value)}
                                                    minLength={6}
                                                    autoComplete="new-password"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-2">
                                                <Label htmlFor="profile-dialog-confirm-password">Повторите пароль</Label>
                                                <Input
                                                    id="profile-dialog-confirm-password"
                                                    type="password"
                                                    value={confirmPassword}
                                                    onChange={(event) => setConfirmPassword(event.target.value)}
                                                    minLength={6}
                                                    autoComplete="new-password"
                                                />
                                            </div>
                                        </div>
                                        <Button
                                            type="submit"
                                            className="self-start"
                                            disabled={passwordBusy || !currentPassword || newPassword.length < 6 || !confirmPassword}
                                        >
                                            {passwordBusy ? <Loader2 className="animate-spin"/> : null}
                                            Изменить пароль
                                        </Button>
                                    </form>
                                    </div>
                                ) : null}
                            </div>
                        )}
                    </div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}
