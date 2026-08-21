import { Skeleton } from '@/components/ui/skeleton';

function PosterGrid({ count = 8 }: { count?: number }) {
    return (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: count }, (_, index) => (
                <div key={index} className="flex min-w-0 flex-col gap-2">
                    <Skeleton className="aspect-[3/4] w-full"/>
                    <Skeleton className="h-4 w-4/5"/>
                    <Skeleton className="h-3 w-2/5"/>
                </div>
            ))}
        </div>
    );
}

export function CatalogPageSkeleton() {
    return (
        <div
            aria-busy="true"
            aria-label="Загрузка фильмотеки"
            className="flex flex-col gap-6"
        >
            <div className="flex items-center gap-2">
                <Skeleton className="h-9 min-w-0 max-w-sm flex-1"/>
                <Skeleton className="ml-auto size-9 shrink-0"/>
                <Skeleton className="size-9 shrink-0"/>
                <Skeleton className="size-9 shrink-0"/>
            </div>
            <Skeleton className="h-6 w-44"/>
            <PosterGrid/>
        </div>
    );
}

export function MovieDetailSkeleton() {
    return (
        <div
            aria-busy="true"
            aria-label="Загрузка фильма"
            className="flex flex-col gap-6"
        >
            <div className="flex flex-col gap-8 lg:flex-row">
                <Skeleton className="aspect-2/3 w-full max-w-72 shrink-0 self-start"/>
                <div className="flex min-w-0 flex-1 flex-col gap-5">
                    <Skeleton className="h-5 w-40"/>
                    <div className="flex gap-2">
                        <Skeleton className="h-9 w-32"/>
                        <Skeleton className="h-9 w-28"/>
                    </div>
                    <Skeleton className="h-4 w-3/4"/>
                    <div className="flex gap-2">
                        <Skeleton className="h-7 w-20 rounded-full"/>
                        <Skeleton className="h-7 w-24 rounded-full"/>
                        <Skeleton className="h-7 w-16 rounded-full"/>
                    </div>
                    <div className="flex gap-5 border-b border-border/50 pb-3">
                        <Skeleton className="h-5 w-24"/>
                        <Skeleton className="h-5 w-32"/>
                    </div>
                    <Skeleton className="aspect-video w-full max-w-xl"/>
                    <Skeleton className="h-6 w-36"/>
                    <div className="flex flex-col gap-2">
                        <Skeleton className="h-4 w-full"/>
                        <Skeleton className="h-4 w-11/12"/>
                        <Skeleton className="h-4 w-3/4"/>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function PersonDetailSkeleton() {
    return (
        <div
            aria-busy="true"
            aria-label="Загрузка персоны"
            className="flex flex-col gap-8"
        >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <Skeleton className="aspect-2/3 w-36 shrink-0 sm:w-40"/>
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                    <Skeleton className="h-7 w-52 max-w-full"/>
                    <Skeleton className="h-4 w-36"/>
                    <Skeleton className="mt-2 h-4 w-72 max-w-full"/>
                    <Skeleton className="h-4 w-60 max-w-full"/>
                    <Skeleton className="h-4 w-64 max-w-full"/>
                </div>
            </div>
            <Skeleton className="h-6 w-48"/>
            <PosterGrid count={5}/>
        </div>
    );
}
