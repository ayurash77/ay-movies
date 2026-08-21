import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { Window } from 'happy-dom';

import { ProgressiveImage } from '../src/components/ui/progressive-image';
import { NavigationProgress } from '../src/components/loading/NavigationProgress';
import {
    CatalogPageSkeleton,
    MovieDetailSkeleton,
    PersonDetailSkeleton,
} from '../src/components/loading/RouteSkeletons';

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

test('navigation progress only renders while pending', () => {
    const view = render(createElement(NavigationProgress, { pending: false }));
    assert.equal(view.queryByRole('progressbar'), null);

    view.rerender(createElement(NavigationProgress, { pending: true }));
    assert.ok(view.getByRole('progressbar', { name: 'Загрузка страницы' }));
});

test('route skeletons expose busy state and stable media shapes', () => {
    const movie = render(createElement(MovieDetailSkeleton));
    assert.equal(movie.getByLabelText('Загрузка фильма').getAttribute('aria-busy'), 'true');
    assert.ok(movie.container.querySelector('.aspect-2\\/3'));
    assert.ok(movie.container.querySelector('.aspect-video'));
    movie.unmount();

    const catalog = render(createElement(CatalogPageSkeleton));
    assert.equal(catalog.getByLabelText('Загрузка фильмотеки').getAttribute('aria-busy'), 'true');
    assert.equal(catalog.container.querySelectorAll('.aspect-\\[3\\/4\\]').length, 8);
    catalog.unmount();

    const person = render(createElement(PersonDetailSkeleton));
    assert.equal(person.getByLabelText('Загрузка персоны').getAttribute('aria-busy'), 'true');
    assert.ok(person.container.querySelector('.aspect-2\\/3'));
});

test('router and high-traffic routes own delayed pending feedback', () => {
    const router = read('src/router.tsx');
    const root = read('src/routes/__root.tsx');

    assert.match(router, /defaultPendingMs:\s*120/);
    assert.match(router, /defaultPendingMinMs:\s*250/);
    assert.match(read('src/routes/index.tsx'), /pendingComponent:\s*CatalogPageSkeleton/);
    assert.match(read('src/routes/movies/index.tsx'), /pendingComponent:\s*CatalogPageSkeleton/);
    assert.match(read('src/routes/movies/$movieId.tsx'), /pendingComponent:\s*MovieDetailSkeleton/);
    assert.match(read('src/routes/people/$personId.tsx'), /pendingComponent:\s*PersonDetailSkeleton/);
    assert.match(root, /useRouterState/);
    assert.match(root, /<NavigationProgress pending=\{navigationPending\}/);
});
