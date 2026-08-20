import { useState, type FormEvent } from 'react';
import { Link, useRouter } from '@tanstack/react-router';
import { Frown, Meh, MessageSquareText, Pencil, Send, Smile, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatRuDateTime } from '@/lib/date-format';
import { cn } from '@/lib/utils';
import {
    addReview,
    deleteReview,
    updateReview,
    type MovieReview,
    type ReviewContent,
    type ReviewSentiment,
} from '@/server/reviews';

type ReviewsSectionProps = {
    movieId: string;
    reviews: MovieReview[];
    isAuthed: boolean;
};

type ReviewCardProps = {
    review: MovieReview;
    isAuthed?: boolean;
    onEdit: () => void;
    onDelete: () => void;
};

type ReviewEditorProps = {
    initial?: ReviewContent;
    submitLabel: string;
    isSubmitting: boolean;
    onSubmit: (content: ReviewContent) => void | Promise<void>;
    onCancel?: () => void;
};

const sentimentOptions: Array<{
    value: ReviewSentiment;
    label: string;
    icon: typeof Smile;
    activeClassName: string;
}> = [
    { value: 'POSITIVE', label: 'Положительная', icon: Smile, activeClassName: 'border-emerald-500/70 bg-emerald-500/15 text-emerald-400' },
    { value: 'NEUTRAL', label: 'Нейтральная', icon: Meh, activeClassName: 'border-primary/70 bg-primary/15 text-primary' },
    { value: 'NEGATIVE', label: 'Отрицательная', icon: Frown, activeClassName: 'border-rose-500/70 bg-rose-500/15 text-rose-400' },
];

const sentimentCardClassNames: Record<ReviewSentiment, string> = {
    POSITIVE: 'border-l-emerald-500',
    NEUTRAL: 'border-l-muted-foreground/70',
    NEGATIVE: 'border-l-rose-500',
};

function initials(name: string) {
    const words = name.trim().split(/\s+/);
    return ((words[0]?.[0] ?? '?') + (words[1]?.[0] ?? '')).toUpperCase();
}

function openAuthorProfile(userId: string) {
    window.dispatchEvent(new CustomEvent('ay-movies:open-profile', { detail: { userId } }));
}

function ReviewEditor({ initial, submitLabel, isSubmitting, onSubmit, onCancel }: ReviewEditorProps) {
    const [ title, setTitle ] = useState(initial?.title ?? '');
    const [ sentiment, setSentiment ] = useState<ReviewSentiment>(initial?.sentiment ?? 'NEUTRAL');
    const [ text, setText ] = useState(initial?.text ?? '');

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const trimmedText = text.trim();
        if (!trimmedText || isSubmitting) return;
        void onSubmit({
            title: title.trim() || null,
            sentiment,
            text: trimmedText,
        });
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-md border border-border bg-card p-3">
            <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Заголовок (необязательно)"
                maxLength={120}
                aria-label="Заголовок рецензии"
            />
            <div className="grid grid-cols-3 gap-1" role="group" aria-label="Впечатление от фильма">
                {sentimentOptions.map((option) => {
                    const Icon = option.icon;
                    const active = sentiment === option.value;
                    return (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => setSentiment(option.value)}
                            aria-pressed={active}
                            className={cn(
                                'flex min-h-9 min-w-0 items-center justify-center gap-1 rounded-md border border-border px-1.5 text-xs font-medium text-muted-foreground transition-colors sm:px-2',
                                active && option.activeClassName,
                            )}
                        >
                            <Icon className="size-4 shrink-0"/>
                            <span className="hidden truncate sm:inline">{option.label}</span>
                        </button>
                    );
                })}
            </div>
            <Textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Поделитесь впечатлениями о фильме..."
                rows={4}
                maxLength={5000}
                aria-label="Текст рецензии"
            />
            <div className="flex justify-end gap-2">
                {onCancel ? (
                    <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isSubmitting}>
                        <X/>
                        Отмена
                    </Button>
                ) : null}
                <Button type="submit" size="sm" disabled={isSubmitting || !text.trim()}>
                    <Send/>
                    {isSubmitting ? 'Сохранение...' : submitLabel}
                </Button>
            </div>
        </form>
    );
}

export function ReviewCard({ review, isAuthed = true, onEdit, onDelete }: ReviewCardProps) {
    const [ imageFailed, setImageFailed ] = useState(false);
    const authorContent = (
        <>
            {review.author.avatarUrl && !imageFailed ? (
                <img
                    src={review.author.avatarUrl}
                    alt={review.author.name}
                    className="size-9 shrink-0 rounded-full object-cover"
                    onError={() => setImageFailed(true)}
                />
            ) : (
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground" aria-hidden="true">
                    {initials(review.author.name)}
                </span>
            )}
            <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-foreground hover:text-primary">
                    {review.author.name}
                </span>
                <span className="block text-xs text-muted-foreground">
                    {formatRuDateTime(review.createdAt)}
                    {review.edited ? ' · изменено' : ''}
                </span>
            </span>
        </>
    );
    return (
        <article
            data-sentiment={review.sentiment}
            className={cn(
                'rounded-md border border-l-4 border-border bg-card p-3 shadow-sm',
                sentimentCardClassNames[review.sentiment],
            )}
        >
            <div className="flex min-w-0 items-center gap-2">
                {isAuthed ? (
                    <button
                        type="button"
                        onClick={() => openAuthorProfile(review.author.id)}
                        className="flex min-w-0 items-center gap-2 text-left"
                        aria-label={`Открыть профиль ${review.author.name}`}
                    >
                        {authorContent}
                    </button>
                ) : (
                    <a
                        href="/sign-in"
                        className="flex min-w-0 items-center gap-2 text-left"
                        aria-label={`Войти, чтобы открыть профиль ${review.author.name}`}
                    >
                        {authorContent}
                    </a>
                )}
                {review.canManage ? (
                    <div className="ml-auto flex shrink-0 items-center gap-0.5">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground"
                            onClick={onEdit}
                            aria-label="Редактировать рецензию"
                            title="Редактировать"
                        >
                            <Pencil className="size-4"/>
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-destructive"
                            onClick={onDelete}
                            aria-label="Удалить рецензию"
                            title="Удалить"
                        >
                            <Trash2 className="size-4"/>
                        </Button>
                    </div>
                ) : null}
            </div>
            {review.title ? <h3 className="mt-3 text-base font-semibold">{review.title}</h3> : null}
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{review.text}</p>
        </article>
    );
}

export function ReviewsSection({ movieId, reviews, isAuthed }: ReviewsSectionProps) {
    const router = useRouter();
    const [ isAdding, setIsAdding ] = useState(false);
    const [ editingId, setEditingId ] = useState<string | null>(null);
    const [ deletingId, setDeletingId ] = useState<string | null>(null);

    const handleAdd = async (content: ReviewContent) => {
        setIsAdding(true);
        try {
            const result = await addReview({ data: { movieId, ...content } });
            if (result.ok) {
                toast.success('Рецензия опубликована');
                await router.invalidate();
            } else {
                toast.error(result.error);
            }
        } catch {
            toast.error('Не удалось опубликовать рецензию');
        } finally {
            setIsAdding(false);
        }
    };

    const handleUpdate = async (reviewId: string, content: ReviewContent) => {
        setIsAdding(true);
        try {
            const result = await updateReview({ data: { reviewId, ...content } });
            if (result.ok) {
                setEditingId(null);
                toast.success('Рецензия обновлена');
                await router.invalidate();
            } else {
                toast.error(result.error);
            }
        } catch {
            toast.error('Не удалось обновить рецензию');
        } finally {
            setIsAdding(false);
        }
    };

    const handleDelete = async (reviewId: string) => {
        if (!window.confirm('Удалить рецензию?')) return;
        setDeletingId(reviewId);
        try {
            const result = await deleteReview({ data: { reviewId } });
            if (result.ok) {
                toast.success('Рецензия удалена');
                await router.invalidate();
            } else {
                toast.error(result.error);
            }
        } catch {
            toast.error('Не удалось удалить рецензию');
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <section className="flex flex-col gap-4">
            <h2 className="flex items-center gap-2 text-xl font-bold">
                <MessageSquareText className="size-5 text-primary"/>
                Рецензии
                <span className="text-base font-normal text-muted-foreground">{reviews.length}</span>
            </h2>

            {isAuthed ? (
                <ReviewEditor
                    key={`new-${reviews.length}`}
                    submitLabel="Опубликовать"
                    isSubmitting={isAdding}
                    onSubmit={handleAdd}
                />
            ) : (
                <p className="text-sm text-muted-foreground">
                    <Link to="/sign-in" className="text-primary hover:underline">Войдите</Link>
                    , чтобы оставить рецензию
                </p>
            )}

            {reviews.length === 0 ? (
                <p className="text-sm text-muted-foreground">Рецензий пока нет. Будьте первым.</p>
            ) : (
                <div className="flex flex-col gap-3">
                    {reviews.map((review) => (
                        <div key={review.id} className="flex flex-col gap-2">
                            <ReviewCard
                                review={review}
                                isAuthed={isAuthed}
                                onEdit={() => setEditingId(review.id)}
                                onDelete={() => {
                                    if (deletingId !== review.id) void handleDelete(review.id);
                                }}
                            />
                            {editingId === review.id ? (
                                <ReviewEditor
                                    initial={{
                                        title: review.title,
                                        sentiment: review.sentiment,
                                        text: review.text,
                                    }}
                                    submitLabel="Сохранить"
                                    isSubmitting={isAdding}
                                    onSubmit={(content) => handleUpdate(review.id, content)}
                                    onCancel={() => setEditingId(null)}
                                />
                            ) : null}
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
