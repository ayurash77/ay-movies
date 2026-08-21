import type { ImgHTMLAttributes } from 'react';
import { Film } from 'lucide-react';

import { ProgressiveImage } from '@/components/ui/progressive-image';
import { cn } from '@/lib/utils';

type MoviePosterProps = {
    posterUrl: string | null;
    title: string;
    className?: string;
    loading?: ImgHTMLAttributes<HTMLImageElement>['loading'];
    fetchPriority?: ImgHTMLAttributes<HTMLImageElement>['fetchPriority'];
};

export function MoviePoster({
    posterUrl,
    title,
    className,
    loading = 'lazy',
    fetchPriority,
}: MoviePosterProps) {
    const fallback = (
        <div className="flex size-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-secondary via-muted to-background p-4">
            <Film className="size-10 text-muted-foreground/60"/>
            <span className="text-center text-sm font-medium text-muted-foreground">
                {title}
            </span>
        </div>
    );

    return (
        <ProgressiveImage
            src={posterUrl ?? undefined}
            alt={`Постер: ${title}`}
            loading={loading}
            fetchPriority={fetchPriority}
            wrapperClassName={cn('aspect-2/3 w-full', className)}
            className="object-cover"
            fallback={fallback}
        />
    );
}
