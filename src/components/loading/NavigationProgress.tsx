export function NavigationProgress({ pending }: { pending: boolean }) {
    if (!pending) return null;

    return (
        <div
            role="progressbar"
            aria-label="Загрузка страницы"
            className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-0.5 overflow-hidden"
        >
            <span className="navigation-progress-bar block h-full bg-primary shadow-[0_0_8px_color-mix(in_oklch,var(--primary),transparent_30%)]"/>
        </div>
    );
}
