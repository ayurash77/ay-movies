import assert from 'node:assert/strict';
import test from 'node:test';

import type { MovieVideoMetadata } from '../src/lib/movie-videos';
import {
    enrichMovieVideoThumbnails,
    kinopoiskWidgetThumbnailFromHtml,
} from '../src/server/movie-video-thumbnails';

function widgetHtml(trailerId: string, path: string) {
    const state = encodeURIComponent(JSON.stringify({
        models: {
            trailers: {
                [trailerId]: {
                    img: {
                        bigPreviewUrl: { x1: `//avatars.mds.yandex.net/${path}/540x304` },
                        mediumPreviewUrl: { x1: `//avatars.mds.yandex.net/${path}/224x126` },
                    },
                },
            },
        },
    }));
    return `<script type="application/json" data-state>${state}</script>`;
}

function widgetVideo(position: number): MovieVideoMetadata {
    return {
        provider: 'kinopoisk-unofficial',
        site: 'KINOPOISK_WIDGET',
        title: `Трейлер ${position}`,
        kind: 'TRAILER',
        url: `https://widgets.kinopoisk.ru/discovery/trailer/${position}`,
        thumbnailUrl: null,
        position,
    };
}

test('extracts the selected Kinopoisk Widget thumbnail by exact trailer id', () => {
    const html = widgetHtml('51149', 'trailer-51149');

    assert.equal(
        kinopoiskWidgetThumbnailFromHtml(html, '51149'),
        'https://avatars.mds.yandex.net/trailer-51149/540x304',
    );
    assert.equal(kinopoiskWidgetThumbnailFromHtml(html, '5114'), null);
    assert.equal(kinopoiskWidgetThumbnailFromHtml('<html/>', '51149'), null);
});

test('enriches widget thumbnails with at most four concurrent requests', async () => {
    let active = 0;
    let maxActive = 0;
    const videos = Array.from({ length: 7 }, (_, index) => widgetVideo(index + 1));

    const enriched = await enrichMovieVideoThumbnails(videos, async (url) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        const trailerId = url.split('/').at(-1)!;
        return widgetHtml(trailerId, `trailer-${trailerId}`);
    });

    assert.equal(maxActive, 4);
    assert.deepEqual(
        enriched.map((video) => video.thumbnailUrl),
        videos.map((_, index) => `https://avatars.mds.yandex.net/trailer-${index + 1}/540x304`),
    );
});

test('derives YouTube thumbnails without loading remote HTML', async () => {
    let calls = 0;
    const video: MovieVideoMetadata = {
        provider: 'kinopoisk-unofficial',
        site: 'YOUTUBE',
        title: 'Трейлер',
        kind: 'TRAILER',
        url: 'https://www.youtube.com/watch?v=abc123def45',
        thumbnailUrl: null,
        position: 0,
    };

    const [ enriched ] = await enrichMovieVideoThumbnails([ video ], async () => {
        calls++;
        return null;
    });

    assert.equal(calls, 0);
    assert.equal(enriched?.thumbnailUrl, 'https://i.ytimg.com/vi/abc123def45/hqdefault.jpg');
});

test('keeps existing thumbnail when widget loading fails', async () => {
    const existing = {
        ...widgetVideo(42),
        thumbnailUrl: 'https://example.com/existing.jpg',
    };

    const [ enriched ] = await enrichMovieVideoThumbnails([ existing ], async () => {
        throw new Error('network failed');
    });

    assert.equal(enriched?.thumbnailUrl, existing.thumbnailUrl);
});
