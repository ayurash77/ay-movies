import { Star } from 'lucide-react';

import { cn } from '@/lib/utils';

type RatingStarsProps = {
    value: number;
    className?: string;
};

export function RatingStars({ value, className }: RatingStarsProps) {
    const shown = value / 2;

    return (
        <div
            className={cn('flex items-center gap-0.5', className)}
            aria-label={`Рейтинг ${value.toFixed(1)} из 10`}
        >
            {[ 1, 2, 3, 4, 5 ].map((star) => {
                const fillRatio = Math.max(0, Math.min(1, shown - (star - 1)));
                return (
                    <span
                        key={star}
                        className="relative grid cursor-default place-items-center border-0 bg-transparent p-0"
                        aria-hidden="true"
                        data-rating-star
                    >
                        <span className="relative block">
                            <Star className="size-4 text-muted-foreground/40"/>
                            <span
                                className="absolute inset-0 overflow-hidden"
                                style={{ width: `${fillRatio * 100}%` }}
                            >
                                <Star className="size-4 fill-star text-star"/>
                            </span>
                        </span>
                    </span>
                );
            })}
        </div>
    );
}
