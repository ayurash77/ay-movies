import assert from 'node:assert/strict';
import test from 'node:test';

import {
    mergeMovieVideoSources,
    movieVideoEmbedUrl,
    movieVideoSnapshotSchema,
    normalizeMovieVideoSnapshot,
} from '../src/lib/movie-videos';
import { mapKinopoiskUnofficialVideos } from '../src/server/movie-lookup-providers/kinopoisk-unofficial';

test('maps only supported trailers and teasers in stable display order', () => {
    const videos = mapKinopoiskUnofficialVideos([
        {
            name: 'О съёмках',
            site: 'KINOPOISK_WIDGET',
            url: 'https://widgets.kinopoisk.ru/discovery/trailer/1',
        },
        {
            name: 'Тизер №1',
            site: 'KINOPOISK_WIDGET',
            url: 'https://widgets.kinopoisk.ru/discovery/trailer/2',
        },
        {
            name: 'Official Trailer',
            site: 'YOUTUBE',
            url: 'https://www.youtube.com/watch?v=abc123def45',
        },
        {
            name: 'Trailer duplicate',
            site: 'YOUTUBE',
            url: 'https://youtu.be/abc123def45',
        },
        {
            name: 'Интервью',
            site: 'UNKNOWN',
            url: 'https://example.com/interview',
        },
    ]);

    assert.deepEqual(videos.map(({ title, kind, position }) => ({ title, kind, position })), [
        { title: 'Official Trailer', kind: 'TRAILER', position: 0 },
        { title: 'Тизер №1', kind: 'TEASER', position: 1 },
    ]);
});

test('normalizer rejects insecure and unsupported player URLs', () => {
    assert.deepEqual(normalizeMovieVideoSnapshot([
        {
            provider: 'kinopoisk-unofficial',
            site: 'YOUTUBE',
            title: 'Трейлер',
            kind: 'TRAILER',
            url: 'http://www.youtube.com/watch?v=abc123def45',
            position: 0,
        },
        {
            provider: 'kinopoisk-unofficial',
            site: 'UNKNOWN',
            title: 'Трейлер',
            kind: 'TRAILER',
            url: 'https://example.com/video',
            position: 1,
        },
        {
            provider: 'kinopoisk-unofficial',
            site: 'KINOPOISK_WIDGET',
            title: 'Трейлер',
            kind: 'TRAILER',
            url: 'https://widgets.kinopoisk.ru/profile/42',
            position: 2,
        },
    ]), []);
});

test('normalizer canonicalizes duplicate YouTube URLs and reassigns positions', () => {
    assert.deepEqual(normalizeMovieVideoSnapshot([
        {
            provider: 'kinopoisk-unofficial',
            site: 'YOUTUBE',
            title: 'Второй трейлер',
            kind: 'TRAILER',
            url: 'https://youtu.be/abc123def45',
            position: 3,
        },
        {
            provider: 'kinopoisk-unofficial',
            site: 'YOUTUBE',
            title: 'Дубликат',
            kind: 'TRAILER',
            url: 'https://www.youtube.com/watch?v=abc123def45&utm_source=test',
            position: 4,
        },
        {
            provider: 'kinopoisk-unofficial',
            site: 'VIMEO',
            title: 'Первый трейлер',
            kind: 'TRAILER',
            url: 'https://vimeo.com/123456',
            position: 1,
        },
    ]).map(({ title, position }) => ({ title, position })), [
        { title: 'Первый трейлер', position: 0 },
        { title: 'Второй трейлер', position: 1 },
    ]);
});

test('video snapshot schema enforces the provider item limit', () => {
    const oversized = Array.from({ length: 31 }, (_, position) => ({
        provider: 'kinopoisk-unofficial',
        site: 'YOUTUBE',
        title: `Трейлер ${position}`,
        kind: 'TRAILER',
        url: `https://www.youtube.com/watch?v=${String(position).padStart(11, 'a')}`,
        position,
    }));

    assert.equal(movieVideoSnapshotSchema.safeParse(oversized).success, false);
});

test('automatic videos precede deduplicated manual links', () => {
    const automatic = [ {
        provider: 'kinopoisk-unofficial' as const,
        site: 'YOUTUBE',
        title: 'Официальный трейлер',
        kind: 'TRAILER' as const,
        url: 'https://www.youtube.com/watch?v=abc123def45',
        position: 0,
    } ];

    const merged = mergeMovieVideoSources(automatic, [
        'https://youtu.be/abc123def45',
        'https://vimeo.com/123456',
    ]);

    assert.deepEqual(merged.map((video) => [ video.origin, video.title ]), [
        [ 'automatic', 'Официальный трейлер' ],
        [ 'manual', 'Трейлер 1' ],
    ]);
});

test('embed conversion only accepts supported player URLs', () => {
    assert.equal(
        movieVideoEmbedUrl('https://youtu.be/abc123def45'),
        'https://www.youtube.com/embed/abc123def45',
    );
    assert.equal(
        movieVideoEmbedUrl('https://widgets.kinopoisk.ru/discovery/trailer/42'),
        'https://widgets.kinopoisk.ru/discovery/trailer/42',
    );
    assert.equal(movieVideoEmbedUrl('https://example.com/video'), null);
});
