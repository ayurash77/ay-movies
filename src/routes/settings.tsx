import { useState } from 'react';
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import { toast } from 'sonner';

import { PageTitle } from '@/components/AppTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { changePassword, updateName } from '@/server/profile';

export const Route = createFileRoute('/settings')({
    beforeLoad: ({ context }) => {
        if (!context.user) {
            throw redirect({ to: '/sign-in', search: { redirectTo: '/settings' } });
        }
    },
    component: SettingsPage,
});

function SettingsPage() {
    const { user } = Route.useRouteContext();
    const router = useRouter();
    const [ isSavingName, setIsSavingName ] = useState(false);
    const [ isSavingPassword, setIsSavingPassword ] = useState(false);

    const handleName = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const name = String(new FormData(event.currentTarget).get('name') ?? '').trim();
        if (!name) return;

        setIsSavingName(true);
        try {
            const result = await updateName({ data: { name } });
            if (result.ok) {
                toast.success('Имя обновлено');
                await router.invalidate();
            } else {
                toast.error(result.error);
            }
        } finally {
            setIsSavingName(false);
        }
    };

    const handlePassword = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const formEl = event.currentTarget;
        const form = new FormData(formEl);
        const current = String(form.get('current') ?? '');
        const next = String(form.get('next') ?? '');
        const confirm = String(form.get('confirm') ?? '');

        if (next !== confirm) {
            toast.error('Новые пароли не совпадают');
            return;
        }

        setIsSavingPassword(true);
        try {
            const result = await changePassword({ data: { current, next } });
            if (result.ok) {
                toast.success('Пароль изменён');
                formEl.reset();
            } else {
                toast.error(result.error);
            }
        } catch {
            toast.error('Пароль должен быть не короче 6 символов');
        } finally {
            setIsSavingPassword(false);
        }
    };

    return (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
            <PageTitle title="Настройки"/>

            <Card>
                <CardHeader>
                    <CardTitle>Имя</CardTitle>
                    <CardDescription>Отображается в рецензиях и на добавленных фильмах</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleName} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <div className="flex flex-1 flex-col gap-2">
                            <Label htmlFor="name">Имя</Label>
                            <Input id="name" name="name" required maxLength={100} defaultValue={user?.name ?? ''}/>
                        </div>
                        <Button type="submit" disabled={isSavingName}>
                            {isSavingName ? 'Сохранение…' : 'Сохранить'}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Смена пароля</CardTitle>
                    <CardDescription>Минимум 6 символов</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handlePassword} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="current">Текущий пароль</Label>
                            <Input id="current" name="current" type="password" required autoComplete="current-password"/>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="next">Новый пароль</Label>
                                <Input id="next" name="next" type="password" required minLength={6} autoComplete="new-password"/>
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="confirm">Повторите новый пароль</Label>
                                <Input id="confirm" name="confirm" type="password" required minLength={6} autoComplete="new-password"/>
                            </div>
                        </div>
                        <Button type="submit" disabled={isSavingPassword} className="self-end">
                            {isSavingPassword ? 'Сохранение…' : 'Сменить пароль'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
