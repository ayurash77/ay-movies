import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { Window } from 'happy-dom';

import { ProgressiveImage } from '../src/components/ui/progressive-image';

const browserWindow = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
    self: browserWindow,
    window: browserWindow,
    document: browserWindow.document,
    Node: browserWindow.Node,
    HTMLElement: browserWindow.HTMLElement,
    HTMLImageElement: browserWindow.HTMLImageElement,
    SVGElement: browserWindow.SVGElement,
    MutationObserver: browserWindow.MutationObserver,
    getComputedStyle: browserWindow.getComputedStyle.bind(browserWindow),
    requestAnimationFrame: browserWindow.requestAnimationFrame.bind(browserWindow),
    cancelAnimationFrame: browserWindow.cancelAnimationFrame.bind(browserWindow),
});

test.afterEach(() => cleanup());

function read(path: string) {
    return readFileSync(path, 'utf8');
}

test('progressive image shows skeleton, fades in on load, and removes skeleton', () => {
    const view = render(createElement(ProgressiveImage, {
        src: 'https://example.com/poster.jpg',
        alt: 'Постер',
        wrapperClassName: 'aspect-2/3',
        fallback: createElement('span', null, 'Нет изображения'),
    }));
    const image = view.getByRole('img', { name: 'Постер' });

    assert.ok(view.container.querySelector('[data-slot="skeleton"]'));
    fireEvent.load(image);
    assert.equal(view.container.querySelector('[data-slot="skeleton"]'), null);
    assert.match(image.className, /opacity-100/);
});

test('progressive image replaces a failed request with semantic fallback', () => {
    const view = render(createElement(ProgressiveImage, {
        src: 'https://example.com/missing.jpg',
        alt: 'Портрет',
        wrapperClassName: 'size-12',
        fallback: createElement('span', null, 'Нет портрета'),
    }));

    fireEvent.error(view.getByRole('img', { name: 'Портрет' }));
    assert.equal(view.queryByRole('img'), null);
    assert.match(view.container.textContent ?? '', /Нет портрета/);
    assert.match(view.container.firstElementChild?.className ?? '', /size-12/);
});

test('movie media surfaces use one progressive image primitive with stable dimensions', () => {
    const sources = [
        [ 'src/components/movies/MoviePoster.tsx', /ProgressiveImage/, /aspect-2\/3/ ],
        [ 'src/components/movies/MovieCast.tsx', /ProgressiveImage/, /size-12/ ],
        [ 'src/routes/people/$personId.tsx', /ProgressiveImage/, /aspect-2\/3/ ],
        [ 'src/components/movies/SeriesSeasons.tsx', /ProgressiveImage/, /aspect-video/ ],
        [ 'src/components/movies/MovieTrailers.tsx', /ProgressiveImage/, /aspect-video/ ],
    ] as const;

    for (const [ path, primitive, dimension ] of sources) {
        const source = read(path);
        assert.match(source, primitive, path);
        assert.match(source, dimension, path);
    }
});
