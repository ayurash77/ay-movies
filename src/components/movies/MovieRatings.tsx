import { useRef, useState, type KeyboardEvent } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Link } from '@tanstack/react-router';

import { Button } from '@/components/ui/button';
import type { ExternalRatings } from '@/lib/movie-lookup-types';
import { cn, formatRating } from '@/lib/utils';

const voteFormatter = new Intl.NumberFormat('ru-RU');

function formatVotes(votes: number) {
    const lastTwoDigits = votes % 100;
    const lastDigit = votes % 10;
    const noun = lastTwoDigits >= 11 && lastTwoDigits <= 14
        ? 'голосов'
        : lastDigit === 1
            ? 'голос'
            : lastDigit >= 2 && lastDigit <= 4
                ? 'голоса'
                : 'голосов';

    return `${voteFormatter.format(votes)} ${noun}`;
}

type MovieRatingsProps = {
    externalRatings: ExternalRatings;
    avgRating: number;
    ratingCount: number;
    myRating: number | null;
    isAuthed: boolean;
    onRate: (value: number | null) => boolean | void | Promise<boolean | void>;
};

const RATING_VALUES = [ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 ] as const;

function RatingTile({ label, value, votes }: { label: string; value: string; votes?: number | null }) {
    return (
        <div className="flex min-h-24 flex-col justify-between gap-2 bg-card p-3">
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
            <div>
                <div className="text-xl font-semibold tabular-nums">{value}</div>
                {votes != null ? (
                    <div className="text-xs tabular-nums text-muted-foreground">
                        {formatVotes(votes)}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

export function RatingPickerPanel({ value, onRate, onClose }: {
    value: number | null;
    onRate: (value: number | null) => boolean | void | Promise<boolean | void>;
    onClose: () => void;
}) {
    const [ selected, setSelected ] = useState<number | null>(value);
    const [ pending, setPending ] = useState(false);
    const ratingRefs = useRef<Array<HTMLButtonElement | null>>([]);

    const selectAndFocus = (rating: number) => {
        setSelected(rating);
        ratingRefs.current[rating - 1]?.focus();
    };

    const handleRatingKeyDown = (event: KeyboardEvent<HTMLButtonElement>, rating: number) => {
        let nextRating: number | null = null;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
            nextRating = rating === 10 ? 1 : rating + 1;
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
            nextRating = rating === 1 ? 10 : rating - 1;
        } else if (event.key === 'Home') {
            nextRating = 1;
        } else if (event.key === 'End') {
            nextRating = 10;
        }

        if (nextRating == null) return;
        event.preventDefault();
        selectAndFocus(nextRating);
    };

    const submit = async (nextValue: number | null) => {
        if (pending) return;
        setPending(true);
        try {
            const saved = await onRate(nextValue);
            if (saved !== false) onClose();
        } finally {
            setPending(false);
        }
    };

    return (
        <div className="flex flex-col gap-3">
            <div>
                <h3 className="text-sm font-semibold">Ваша оценка</h3>
                <p className="text-xs text-muted-foreground">От 1 до 10</p>
            </div>
            <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Ваша оценка">
                {RATING_VALUES.map((rating) => (
                    <Button
                        key={rating}
                        ref={(element) => {
                            ratingRefs.current[rating - 1] = element;
                        }}
                        type="button"
                        size="icon"
                        variant={selected === rating ? 'default' : 'outline'}
                        className="size-11 tabular-nums"
                        role="radio"
                        aria-checked={selected === rating}
                        aria-label={`${rating} из 10`}
                        tabIndex={selected === rating || (selected == null && rating === 1) ? 0 : -1}
                        disabled={pending}
                        onClick={() => setSelected(rating)}
                        onKeyDown={(event) => handleRatingKeyDown(event, rating)}
                    >
                        {rating}
                    </Button>
                ))}
            </div>
            <div className={cn('grid gap-2', value == null ? 'grid-cols-1' : 'grid-cols-2')}>
                {value != null ? (
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={pending}
                        onClick={() => void submit(null)}
                    >
                        Удалить оценку
                    </Button>
                ) : null}
                <Button
                    type="button"
                    size="sm"
                    disabled={selected == null || pending}
                    onClick={() => void submit(selected)}
                >
                    Сохранить оценку
                </Button>
            </div>
        </div>
    );
}

function RatingPicker({ value, onRate }: {
    value: number | null;
    onRate: (value: number | null) => boolean | void | Promise<boolean | void>;
}) {
    const [ open, setOpen ] = useState(false);

    return (
        <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
            <PopoverPrimitive.Trigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={value == null ? 'Оценить' : 'Изменить оценку'}
                >
                    {value == null ? 'Оценить' : 'Изменить'}
                </Button>
            </PopoverPrimitive.Trigger>
            <PopoverPrimitive.Portal>
                <PopoverPrimitive.Content
                    align="end"
                    sideOffset={8}
                    collisionPadding={16}
                    aria-label="Оценить фильм"
                    className="z-50 w-[min(20rem,calc(100vw-2rem))] rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-[0_18px_48px_rgb(0_0_0/0.42)] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
                >
                    <RatingPickerPanel
                        key={`${value ?? 'none'}-${open}`}
                        value={value}
                        onRate={onRate}
                        onClose={() => setOpen(false)}
                    />
                </PopoverPrimitive.Content>
            </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
    );
}

export function MovieRatings({
    externalRatings,
    avgRating,
    ratingCount,
    myRating,
    isAuthed,
    onRate,
}: MovieRatingsProps) {
    return (
        <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Рейтинги</h2>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-px overflow-hidden rounded-md border border-border bg-border">
                {externalRatings.kinopoisk ? (
                    <RatingTile
                        label="Кинопоиск"
                        value={formatRating(externalRatings.kinopoisk.value)}
                        votes={externalRatings.kinopoisk.votes}
                    />
                ) : null}
                {externalRatings.imdb ? (
                    <RatingTile
                        label="IMDb"
                        value={formatRating(externalRatings.imdb.value)}
                        votes={externalRatings.imdb.votes}
                    />
                ) : null}
                {externalRatings.russianCritics ? (
                    <RatingTile
                        label="Критики"
                        value={`${formatRating(externalRatings.russianCritics.value)}%`}
                        votes={externalRatings.russianCritics.votes}
                    />
                ) : null}
                <div className="flex min-h-24 flex-col justify-between gap-2 bg-card p-3">
                    <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-medium text-muted-foreground">AY Movies</span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                            {ratingCount > 0 ? formatVotes(ratingCount) : 'Нет оценок'}
                        </span>
                    </div>
                    <div className="flex items-end justify-between gap-2">
                        <span className="text-xl font-semibold tabular-nums">
                            {ratingCount > 0 ? formatRating(avgRating) : '—'}
                        </span>
                        {isAuthed ? (
                            <RatingPicker value={myRating} onRate={onRate}/>
                        ) : (
                            <Link to="/sign-in" className="text-xs text-primary hover:underline">
                                Войти и оценить
                            </Link>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}
