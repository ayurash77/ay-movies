import { createRouter } from '@tanstack/react-router';

import { routeTree } from './routeTree.gen';

export const getRouter = () => {
    const router = createRouter({
        routeTree,
        context: {},
        scrollRestoration: true,
        defaultPreloadStaleTime: 0,
        defaultPendingMs: 120,
        defaultPendingMinMs: 250,
    });

    return router;
};
