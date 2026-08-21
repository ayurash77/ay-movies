import { z } from 'zod';

export const MOVIE_VIDEO_LIMITS = {
    maxItems: 30,
    maxTitleLength: 300,
    maxSiteLength: 64,
    maxUrlLength: 2048,
} as const;

export const movieVideoKindSchema = z.enum([ 'TRAILER', 'TEASER' ]);

export const movieVideoMetadataSchema = z.object({
    provider: z.literal('kinopoisk-unofficial'),
    site: z.string().trim().min(1).max(MOVIE_VIDEO_LIMITS.maxSiteLength),
    title: z.string().trim().min(1).max(MOVIE_VIDEO_LIMITS.maxTitleLength),
    kind: movieVideoKindSchema,
    url: z.string()
        .trim()
        .max(MOVIE_VIDEO_LIMITS.maxUrlLength)
        .url()
        .refine((value) => supportedMovieVideoUrl(value) !== null, 'Неподдерживаемая ссылка на видео'),
    position: z.number().int().min(0).max(999),
});

export const movieVideoSnapshotSchema = z.array(movieVideoMetadataSchema)
    .max(MOVIE_VIDEO_LIMITS.maxItems);

export type MovieVideoMetadata = z.infer<typeof movieVideoMetadataSchema>;

type SupportedVideoUrl = {
    key: string;
    url: string;
};

const youtubeIdPattern = /^[\w-]{6,20}$/;

function youtubeVideoId(url: URL) {
    if (url.hostname === 'youtu.be') {
        return url.pathname.split('/').filter(Boolean)[0] ?? '';
    }
    if (url.hostname !== 'youtube.com' && url.hostname !== 'www.youtube.com') return '';
    if (url.pathname === '/watch') return url.searchParams.get('v') ?? '';
    const [ section, id ] = url.pathname.split('/').filter(Boolean);
    return section === 'shorts' || section === 'embed' ? id ?? '' : '';
}

export function supportedMovieVideoUrl(value: string): SupportedVideoUrl | null {
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:') return null;
        url.hash = '';

        const youtubeId = youtubeVideoId(url);
        if (youtubeIdPattern.test(youtubeId)) {
            return {
                key: `youtube:${youtubeId}`,
                url: `https://www.youtube.com/watch?v=${youtubeId}`,
            };
        }

        if (url.hostname === 'vimeo.com' || url.hostname === 'www.vimeo.com') {
            const id = url.pathname.split('/').filter(Boolean)[0] ?? '';
            if (!/^\d+$/.test(id)) return null;
            return { key: `vimeo:${id}`, url: `https://vimeo.com/${id}` };
        }

        if (
            url.hostname === 'widgets.kinopoisk.ru'
            && url.pathname.startsWith('/discovery/trailer/')
            && url.pathname.length > '/discovery/trailer/'.length
        ) {
            return {
                key: `kinopoisk:${url.pathname.replace(/\/+$/, '')}`,
                url: url.toString(),
            };
        }
    } catch {
        return null;
    }

    return null;
}

export function normalizeMovieVideoSnapshot(value: unknown): MovieVideoMetadata[] {
    if (!Array.isArray(value)) return [];

    const seen = new Set<string>();
    const videos = value.flatMap((item) => {
        const parsed = movieVideoMetadataSchema.safeParse(item);
        if (!parsed.success) return [];

        const supportedUrl = supportedMovieVideoUrl(parsed.data.url);
        if (!supportedUrl || seen.has(supportedUrl.key)) return [];
        seen.add(supportedUrl.key);

        return [ { ...parsed.data, url: supportedUrl.url } ];
    });

    return videos
        .sort((left, right) => {
            const kindOrder = Number(left.kind === 'TEASER') - Number(right.kind === 'TEASER');
            return kindOrder || left.position - right.position;
        })
        .slice(0, MOVIE_VIDEO_LIMITS.maxItems)
        .map((video, position) => ({ ...video, position }));
}
