import { useState } from 'react';
import { Star } from 'lucide-react';

import { cn } from '@/lib/utils';

type RatingStarsProps = {
    value: number;
    onRate?: (value: number) => void;
    size?: 'sm' | 'lg';
    className?: string;
};

export function RatingStars({ value, onRate, size = 'sm', className }: RatingStarsProps) {
    const [ hovered, setHovered ] = useState<number | null>(null);
    const interactive = Boolean(onRate);
    const shown = hovered ?? value;
    const starSize = size === 'lg' ? 'size-7' : 'size-4';

    return (
        <div
            className={cn('flex items-center gap-0.5', className)}
            onMouseLeave={() => setHovered(null)}
            role={interactive ? 'radiogroup' : undefined}
            aria-label={interactive ? 'Оценка' : `Рейтинг ${value.toFixed(1)} из 5`}
        >
            {[ 1, 2, 3, 4, 5 ].map((star) => {
                const fillRatio = Math.max(0, Math.min(1, shown - (star - 1)));
                return (
                    <button
                        key={star}
                        type="button"
                        disabled={!interactive}
                        onClick={() => onRate?.(star)}
                        onMouseEnter={interactive ? () => setHovered(star) : undefined}
                        className={cn(
                            'relative grid place-items-center border-0 bg-transparent p-0',
                            interactive
                                ? 'size-11 shrink-0 cursor-pointer transition-transform hover:scale-110'
                                : 'cursor-default',
                        )}
                        role={interactive ? 'radio' : undefined}
                        aria-checked={interactive ? value === star : undefined}
                        aria-label={`${star} из 5`}
                    >
                        <span className="relative block">
                            <Star className={cn(starSize, 'text-muted-foreground/40')}/>
                            <span
                                className="absolute inset-0 overflow-hidden"
                                style={{ width: `${fillRatio * 100}%` }}
                            >
                                <Star className={cn(starSize, 'fill-star text-star')}/>
                            </span>
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
