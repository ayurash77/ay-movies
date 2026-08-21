import * as React from 'react';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import { Skeleton } from './skeleton';

type ProgressiveImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
    wrapperClassName?: string;
    fallback: React.ReactNode;
};

type ImageStatus = 'loading' | 'loaded' | 'failed';

function ProgressiveImage({
    src,
    alt,
    className,
    wrapperClassName,
    fallback,
    onLoad,
    onError,
    ...props
}: ProgressiveImageProps) {
    const imageRef = useRef<HTMLImageElement>(null);
    const [ loadedSrc, setLoadedSrc ] = useState<string | null>(null);
    const [ failedSrc, setFailedSrc ] = useState<string | null>(null);
    const status: ImageStatus = !src || failedSrc === src
        ? 'failed'
        : loadedSrc === src ? 'loaded' : 'loading';

    useEffect(() => {
        const image = imageRef.current;
        if (src && image?.complete && image.naturalWidth > 0) {
            setLoadedSrc(src);
        }
    }, [ src ]);

    if (!src || status === 'failed') {
        return (
            <div
                data-slot="progressive-image"
                className={cn('relative overflow-hidden', wrapperClassName)}
            >
                {fallback}
            </div>
        );
    }

    return (
        <div
            data-slot="progressive-image"
            className={cn('relative overflow-hidden', wrapperClassName)}
        >
            {status === 'loading' ? <Skeleton className="absolute inset-0 size-full rounded-none"/> : null}
            <img
                ref={imageRef}
                src={src}
                alt={alt}
                className={cn(
                    'absolute inset-0 size-full transition-opacity duration-300 motion-reduce:transition-none',
                    status === 'loaded' ? 'opacity-100' : 'opacity-0',
                    className,
                )}
                onLoad={(event) => {
                    setLoadedSrc(src);
                    setFailedSrc((current) => current === src ? null : current);
                    onLoad?.(event);
                }}
                onError={(event) => {
                    setFailedSrc(src);
                    onError?.(event);
                }}
                {...props}
            />
        </div>
    );
}

export { ProgressiveImage };
