import { useState } from 'react';
import { createFileRoute, Link, useNavigate, useRouter } from '@tanstack/react-router';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { PageTitle } from '@/components/AppTitle';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signUp } from '@/server/auth';

export const Route = createFileRoute('/sign-up')({
    component: SignUpPage,
});

function SignUpPage() {
    const router = useRouter();
    const navigate = useNavigate();
    const [ isSubmitting, setIsSubmitting ] = useState(false);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);

        const password = String(form.get('password') ?? '');
        const confirm = String(form.get('confirm') ?? '');
        if (password !== confirm) {
            toast.error('Пароли не совпадают');
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await signUp({
                data: {
                    email: String(form.get('email') ?? ''),
                    name: String(form.get('name') ?? ''),
                    password,
                },
            });

            if (result.ok) {
                toast.success('Добро пожаловать в AY Movies!');
                await router.invalidate();
                navigate({ to: '/' });
            } else {
                toast.error(result.error);
            }
        } catch {
            toast.error('Не удалось зарегистрироваться. Проверьте данные.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <PageTitle title="Регистрация"/>
            <Card className="mx-auto mt-10 w-full max-w-sm">
                <CardHeader>
                    <CardTitle className="text-xl">Регистрация</CardTitle>
                    <CardDescription>
                        Создайте аккаунт по электронной почте
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="name">Имя</Label>
                            <Input id="name" name="name" required maxLength={100} autoComplete="name"/>
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" name="email" type="email" required autoComplete="email"/>
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="password">Пароль (минимум 6 символов)</Label>
                            <Input
                                id="password"
                                name="password"
                                type="password"
                                required
                                minLength={6}
                                autoComplete="new-password"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="confirm">Повторите пароль</Label>
                            <Input
                                id="confirm"
                                name="confirm"
                                type="password"
                                required
                                minLength={6}
                                autoComplete="new-password"
                            />
                        </div>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? 'Регистрация…' : 'Создать аккаунт'}
                        </Button>
                        <p className="text-center text-sm text-muted-foreground">
                            Уже есть аккаунт?{' '}
                            <Link to="/sign-in" className="text-primary hover:underline">
                                Войти
                            </Link>
                        </p>
                    </form>
                </CardContent>
            </Card>
        </>
    );
}
