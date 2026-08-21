import {
    MOVIE_VIDEO_LIMITS,
    normalizeMovieVideoSnapshot,
    youtubeMovieVideoThumbnail,
    type MovieVideoMetadata,
} from '@/lib/movie-videos';

const WIDGET_CONCURRENCY = 4;
const WIDGET_TIMEOUT_MS = 10_000;
const DATA_STATE_PATTERN = /<script\s+type=["']application\/json["']\s+data-state>([^<]+)<\/script>/i;

type LoadHtml = (url: string, signal: AbortSignal) => Promise<string | null>;

function record(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function imageUrl(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) return null;
    const candidate = value.startsWith('//') ? `https:${value}` : value;
    if (candidate.length > MOVIE_VIDEO_LIMITS.maxUrlLength) return null;

    try {
        const url = new URL(candidate);
        return url.protocol === 'https:' && url.hostname === 'avatars.mds.yandex.net'
            ? url.toString()
            : null;
    } catch {
        return null;
    }
}

function nestedImageUrl(image: Record<string, unknown>, key: string) {
    return imageUrl(record(image[key])?.x1);
}

export function kinopoiskWidgetThumbnailFromHtml(html: string, trailerId: string) {
    const encodedState = DATA_STATE_PATTERN.exec(html)?.[1];
    if (!encodedState) return null;

    try {
        const state = record(JSON.parse(decodeURIComponent(encodedState)));
        const models = record(state?.models);
        const trailers = record(models?.trailers);
        const trailer = record(trailers?.[trailerId]);
        const image = record(trailer?.img);
        if (!image) return null;

        return nestedImageUrl(image, 'bigPreviewUrl')
            ?? nestedImageUrl(image, 'mediumPreviewUrl')
            ?? nestedImageUrl(image, 'previewUrl');
    } catch {
        return null;
    }
}

function kinopoiskWidgetTrailerId(value: string) {
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.hostname !== 'widgets.kinopoisk.ru') return null;
        return /^\/discovery\/trailer\/(\d+)\/?$/.exec(url.pathname)?.[1] ?? null;
    } catch {
        return null;
    }
}

async function loadWidgetHtml(url: string, signal: AbortSignal) {
    try {
        const response = await fetch(url, {
            signal,
            headers: { accept: 'text/html' },
        });
        return response.ok ? await response.text() : null;
    } catch {
        return null;
    }
}

export async function enrichMovieVideoThumbnails(
    value: MovieVideoMetadata[],
    loadHtml: LoadHtml = loadWidgetHtml,
) {
    const videos = normalizeMovieVideoSnapshot(value);
    if (videos.length === 0) return videos;

    const signal = AbortSignal.timeout(WIDGET_TIMEOUT_MS);
    let cursor = 0;

    async function worker() {
        while (cursor < videos.length) {
            const index = cursor++;
            const video = videos[index];
            if (!video || video.thumbnailUrl) continue;

            const youtubeThumbnail = youtubeMovieVideoThumbnail(video.url);
            if (youtubeThumbnail) {
                videos[index] = { ...video, thumbnailUrl: youtubeThumbnail };
                continue;
            }

            const trailerId = kinopoiskWidgetTrailerId(video.url);
            if (!trailerId) continue;

            try {
                const html = await loadHtml(video.url, signal);
                const thumbnailUrl = html
                    ? kinopoiskWidgetThumbnailFromHtml(html, trailerId)
                    : null;
                if (thumbnailUrl) videos[index] = { ...video, thumbnailUrl };
            } catch {
                // A failed preview must not discard the video or other metadata.
            }
        }
    }

    await Promise.all(Array.from(
        { length: Math.min(WIDGET_CONCURRENCY, videos.length) },
        () => worker(),
    ));
    return videos;
}
