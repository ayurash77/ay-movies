import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import { Bell, CheckCheck, Film, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { PageTitle } from '@/components/AppTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
    listNotifications,
    markAllNotificationsRead,
    markNotificationRead,
    type AppNotification,
} from '@/server/notifications';

export const Route = createFileRoute('/notifications')({
    beforeLoad: ({ context, location }) => {
        if (!context.user) {
            throw redirect({ to: '/sign-in', search: { redirectTo: location.href } });
        }
    },
    loader: async () => listNotifications(),
    component: NotificationsPage,
});

function notifySidebarChanged() {
    window.dispatchEvent(new Event('ay-movies:notifications-changed'));
}

function NotificationCard({ item, busy, onRead }: {
    item: AppNotification;
    busy: boolean;
    onRead: (id: string) => Promise<void>;
}) {
    const isUnread = !item.readAt;

    return (
        <Card className={cn(isUnread && 'border-primary/45 bg-card-active')}>
            <CardHeader className="flex-row items-start gap-3 space-y-0">
                <span className={cn(
                    'mt-0.5 grid size-9 shrink-0 place-items-center rounded-md bg-secondary text-badge-foreground',
                    isUnread && 'bg-primary/15 text-primary',
                )}>
                    {item.type === 'NEW_MOVIE' ? <Film className="size-4"/> : <Bell className="size-4"/>}
                </span>
                <div className="min-w-0 flex-1">
                    <CardTitle className="text-base">{item.title}</CardTitle>
                    {item.body ? (
                        <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
                    ) : null}
                    <p className="mt-2 text-xs text-muted-foreground">{item.createdAtLabel}</p>
                </div>
                {isUnread ? (
                    <span className="mt-1 size-2 rounded-full bg-primary"/>
                ) : null}
            </CardHeader>
            <CardContent className="flex flex-wrap justify-end gap-2">
                {item.href ? (
                    <Button asChild variant="outline" size="sm">
                        <a
                            href={item.href}
                            onClick={(event) => {
                                event.preventDefault();
                                void onRead(item.id).finally(() => {
                                    window.location.assign(item.href!);
                                });
                            }}
                        >
                            Открыть
                        </a>
                    </Button>
                ) : null}
                {isUnread ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => void onRead(item.id)}
                    >
                        {busy ? <Loader2 className="animate-spin"/> : <CheckCheck/>}
                        Прочитано
                    </Button>
                ) : null}
            </CardContent>
        </Card>
    );
}

function NotificationsPage() {
    const notifications = Route.useLoaderData();
    const router = useRouter();
    const [ busyId, setBusyId ] = useState<string | null>(null);
    const [ isMarkingAll, setIsMarkingAll ] = useState(false);
    const unreadCount = notifications.filter((item) => !item.readAt).length;

    const handleRead = async (notificationId: string) => {
        setBusyId(notificationId);
        try {
            const result = await markNotificationRead({ data: { notificationId } });
            if (!result.ok) toast.error(result.error);
            await router.invalidate();
            notifySidebarChanged();
        } catch {
            toast.error('Не удалось обновить уведомление');
        } finally {
            setBusyId(null);
        }
    };

    const handleReadAll = async () => {
        setIsMarkingAll(true);
        try {
            const result = await markAllNotificationsRead();
            if (!result.ok) toast.error(result.error);
            await router.invalidate();
            notifySidebarChanged();
        } catch {
            toast.error('Не удалось обновить уведомления');
        } finally {
            setIsMarkingAll(false);
        }
    };

    return (
        <div className="flex flex-col gap-5">
            <PageTitle title={unreadCount ? `Уведомления (${unreadCount})` : 'Уведомления'}/>
            <div className="flex flex-wrap justify-end gap-3">
                {unreadCount ? (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isMarkingAll}
                        onClick={handleReadAll}
                    >
                        {isMarkingAll ? <Loader2 className="animate-spin"/> : <CheckCheck/>}
                        Прочитать всё
                    </Button>
                ) : null}
            </div>

            {notifications.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                    Уведомлений пока нет.
                </p>
            ) : (
                <div className="flex flex-col gap-3">
                    {notifications.map((item) => (
                        <NotificationCard
                            key={item.id}
                            item={item}
                            busy={busyId === item.id}
                            onRead={handleRead}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
