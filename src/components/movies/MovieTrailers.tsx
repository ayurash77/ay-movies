import { useMemo, useState } from 'react';
import { Clapperboard, ExternalLink, Film, Play } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import type { MovieVideoMetadata, DisplayMovieVideo } from '@/lib/movie-videos';
import { mergeMovieVideoSources, movieVideoEmbedUrl } from '@/lib/movie-videos';
import { cn } from '@/lib/utils';

type MovieTrailersProps = {
    title: string;
    posterUrl: string | null;
    automaticVideos: MovieVideoMetadata[];
    manualUrls: string[];
};

type VideoCardProps = {
    video: DisplayMovieVideo;
    posterUrl: string | null;
    className?: string;
    onSelect: (video: DisplayMovieVideo) => void;
};

function VideoVisual({ posterUrl, title }: { posterUrl: string | null; title: string }) {
    return (
        <div className="relative aspect-video overflow-hidden bg-muted">
            {posterUrl ? (
                <img
                    src={posterUrl}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                />
            ) : (
                <div className="flex size-full items-center justify-center text-muted-foreground">
                    <Film className="size-10" aria-hidden="true"/>
                </div>
            )}
            <div className="absolute inset-0 bg-black/25" aria-hidden="true"/>
            <span
                className="absolute left-1/2 top-1/2 inline-flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 text-foreground shadow-lg backdrop-blur-sm"
                aria-hidden="true"
            >
                <Play className="ml-0.5 size-5 fill-current"/>
            </span>
            <span className="sr-only">{title}</span>
        </div>
    );
}

function VideoCard({ video, posterUrl, className, onSelect }: VideoCardProps) {
    const content = (
        <>
            <VideoVisual posterUrl={posterUrl} title={video.title}/>
            <span className="flex min-w-0 flex-col gap-0.5 p-3 text-left">
                <span className="line-clamp-2 text-sm font-medium leading-snug">{video.title}</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    {video.sourceLabel}
                    {movieVideoEmbedUrl(video.url) ? null : <ExternalLink className="size-3"/>}
                </span>
            </span>
        </>
    );
    const cardClassName = cn(
        'block w-[min(78vw,19rem)] shrink-0 overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm transition-colors hover:border-primary/60 sm:w-72',
        className,
    );

    if (!movieVideoEmbedUrl(video.url)) {
        return (
            <a
                href={video.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Открыть ${video.title}`}
                className={cardClassName}
            >
                {content}
            </a>
        );
    }

    return (
        <button
            type="button"
            aria-label={`Смотреть ${video.title}`}
            className={cn(cardClassName, 'cursor-pointer')}
            onClick={() => onSelect(video)}
        >
            {content}
        </button>
    );
}

export function MovieTrailers({
    title,
    posterUrl,
    automaticVideos,
    manualUrls,
}: MovieTrailersProps) {
    const [ selected, setSelected ] = useState<DisplayMovieVideo | null>(null);
    const [ showAll, setShowAll ] = useState(false);
    const videos = useMemo(
        () => mergeMovieVideoSources(automaticVideos, manualUrls),
        [ automaticVideos, manualUrls ],
    );
    const previewVideos = videos.slice(0, 4);
    const embedUrl = selected ? movieVideoEmbedUrl(selected.url) : null;

    if (videos.length === 0) return null;

    const selectVideo = (video: DisplayMovieVideo) => {
        setShowAll(false);
        setSelected(video);
    };

    return (
        <section className="flex min-w-0 flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
                <h2 className="flex min-w-0 items-center gap-2 text-lg font-semibold">
                    <Clapperboard className="size-5 shrink-0 text-primary"/>
                    Трейлеры и тизеры
                </h2>
                {videos.length > previewVideos.length ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setShowAll(true)}>
                        Все
                    </Button>
                ) : null}
            </div>

            <div className="flex min-w-0 gap-3 overflow-x-auto pb-2">
                {previewVideos.map((video) => (
                    <VideoCard
                        key={`${video.origin}-${video.url}`}
                        video={video}
                        posterUrl={posterUrl}
                        onSelect={selectVideo}
                    />
                ))}
            </div>

            <Dialog open={showAll} onOpenChange={setShowAll}>
                <DialogContent className="max-h-[min(85dvh,48rem)] max-w-4xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Все трейлеры и тизеры</DialogTitle>
                        <DialogDescription className="text-sm text-muted-foreground">
                            {title}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {videos.map((video) => (
                            <VideoCard
                                key={`${video.origin}-${video.url}`}
                                video={video}
                                posterUrl={posterUrl}
                                className="w-full sm:w-full"
                                onSelect={selectVideo}
                            />
                        ))}
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
                <DialogContent className="max-w-4xl p-3 sm:p-4">
                    <DialogHeader>
                        <DialogTitle>{selected?.title ?? 'Трейлер'}</DialogTitle>
                        <DialogDescription className="text-sm text-muted-foreground">
                            {title}{selected?.sourceLabel ? ` · ${selected.sourceLabel}` : ''}
                        </DialogDescription>
                    </DialogHeader>
                    {selected && embedUrl ? (
                        <div className="aspect-video overflow-hidden rounded-md bg-black">
                            <iframe
                                src={embedUrl}
                                title={`${selected.title}: ${title}`}
                                className="size-full"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                allowFullScreen
                            />
                        </div>
                    ) : null}
                </DialogContent>
            </Dialog>
        </section>
    );
}
