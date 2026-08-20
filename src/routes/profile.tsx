import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
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
} from 'lucide-react';

import { PageTitle } from '@/components/AppTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatRuDate } from '@/lib/date-format';
import { cn } from '@/lib/utils';
import { changePassword, getMyProfile, updateName, uploadMyAvatar } from '@/server/profile';

export const Route = createFileRoute('/profile')({
    beforeLoad: ({ context }) => {
        if (!context.user) {
            throw redirect({ to: '/sign-in', search: { redirectTo: '/profile' } });
        }
    },
    loader: async () => {
        const profile = await getMyProfile();
        if (!profile) throw redirect({ to: '/sign-in', search: { redirectTo: '/profile' } });
        return profile;
    },
    component: ProfilePage,
});

function initials(name: string) {
    const words = name.trim().split(/\s+/);
    return ((words[0]?.[0] ?? '?') + (words[1]?.[0] ?? '')).toUpperCase();
}

function StatTile({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
    return (
        <div className="flex min-h-20 items-center gap-3 rounded-md border border-card-border bg-card px-3 py-3 shadow-[0_12px_30px_rgb(0_0_0/0.18)]">
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/12 text-primary [&_svg]:size-4">{icon}</span>
            <span className="min-w-0">
                <span className="block text-xl font-bold leading-tight tabular-nums">{value}</span>
                <span className="block text-xs leading-snug text-muted-foreground">{label}</span>
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

function ProfilePage() {
    const profile = Route.useLoaderData();
    const router = useRouter();
    const fileRef = useRef<HTMLInputElement>(null);
    const [ name, setName ] = useState(profile.name);
    const [ currentPassword, setCurrentPassword ] = useState('');
    const [ newPassword, setNewPassword ] = useState('');
    const [ confirmPassword, setConfirmPassword ] = useState('');
    const [ avatarBusy, setAvatarBusy ] = useState(false);
    const [ nameBusy, setNameBusy ] = useState(false);
    const [ passwordBusy, setPasswordBusy ] = useState(false);
    const joined = formatRuDate(profile.createdAt);

    useEffect(() => {
        setName(profile.name);
    }, [ profile.name ]);

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
                await router.invalidate();
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
        if (!nextName || nextName === profile.name || nameBusy) return;

        setNameBusy(true);
        try {
            const result = await updateName({ data: { name: nextName } });
            if (result.ok) {
                toast.success('Имя обновлено');
                await router.invalidate();
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
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
            <PageTitle title="Профиль"/>

            <Card className="overflow-hidden py-0">
                <div className="h-24 border-b border-border bg-accent"/>
                <CardContent className="-mt-12 flex flex-col gap-5 px-5 pb-5 sm:flex-row sm:items-end sm:justify-between">
                    <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end">
                        <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            disabled={avatarBusy}
                            className="group relative size-28 shrink-0 overflow-hidden rounded-full border-4 border-card bg-card shadow-[0_18px_44px_rgb(0_0_0/0.32)]"
                            aria-label="Сменить фото профиля"
                        >
                            {profile.avatarUrl ? (
                                <img src={profile.avatarUrl} alt="" className="size-full object-cover"/>
                            ) : (
                                <span className="grid size-full place-items-center bg-primary text-3xl font-bold text-primary-foreground">
                                    {initials(profile.name)}
                                </span>
                            )}
                            <span
                                className={cn(
                                    'absolute inset-0 grid place-items-center bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100',
                                    avatarBusy && 'opacity-100',
                                )}
                            >
                                {avatarBusy ? <Loader2 className="size-6 animate-spin"/> : <ImageUp className="size-6"/>}
                            </span>
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
                                <h2 className="truncate text-2xl font-bold tracking-tight">{profile.name}</h2>
                                <RoleBadge role={profile.role}/>
                            </div>
                            <p className="truncate text-sm text-muted-foreground">{profile.email}</p>
                            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                                <CalendarDays className="size-3.5"/>
                                На сайте с {joined}
                            </p>
                            <p className="mt-1 text-[11px] text-muted-foreground/75">
                                Нажмите на фото, чтобы заменить. JPEG, PNG или WebP до 5 МБ.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <StatTile icon={<Film/>} value={profile.moviesAdded} label="Добавлено"/>
                <StatTile icon={<Star/>} value={profile.ratingsCount} label="Оценок"/>
                <StatTile icon={<MessageSquare/>} value={profile.commentsCount} label="Рецензий"/>
                <StatTile icon={<Bookmark/>} value={profile.watchlistCount} label="К просмотру"/>
                <StatTile icon={<Check/>} value={profile.watchedCount} label="Просмотрено"/>
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <Card>
                    <CardHeader>
                        <CardTitle>Данные профиля</CardTitle>
                        <CardDescription>Имя отображается в рецензиях и карточках.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleName} className="flex flex-col gap-3">
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="profile-name">Имя</Label>
                                <Input
                                    id="profile-name"
                                    value={name}
                                    onChange={(event) => setName(event.target.value)}
                                    maxLength={100}
                                    placeholder="Ваше имя"
                                />
                            </div>
                            <Button type="submit" className="self-start" disabled={nameBusy || !name.trim() || name.trim() === profile.name}>
                                {nameBusy ? <Loader2 className="animate-spin"/> : null}
                                Сохранить
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <KeyRound className="size-4 text-primary"/>
                            Пароль
                        </CardTitle>
                        <CardDescription>Минимум 6 символов.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handlePassword} className="flex flex-col gap-3">
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="current-password">Текущий пароль</Label>
                                <Input
                                    id="current-password"
                                    type="password"
                                    value={currentPassword}
                                    onChange={(event) => setCurrentPassword(event.target.value)}
                                    autoComplete="current-password"
                                />
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                                <div className="flex flex-col gap-2">
                                    <Label htmlFor="new-password">Новый пароль</Label>
                                    <Input
                                        id="new-password"
                                        type="password"
                                        value={newPassword}
                                        onChange={(event) => setNewPassword(event.target.value)}
                                        minLength={6}
                                        autoComplete="new-password"
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <Label htmlFor="confirm-password">Повторите пароль</Label>
                                    <Input
                                        id="confirm-password"
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
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
