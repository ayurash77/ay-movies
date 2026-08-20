import { useMemo } from 'react';
import { createFileRoute, Link, notFound, useRouter } from '@tanstack/react-router';
import { ArrowLeft, Clock, Clapperboard, ExternalLink, Globe, Pencil, PlayCircle, Tv, User } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

import { PageTitle } from '@/components/AppTitle';
import { CommentsSection } from '@/components/movies/CommentsSection';
import { MovieCast } from '@/components/movies/MovieCast';
import { MoviePoster } from '@/components/movies/MoviePoster';
import { MovieRatings } from '@/components/movies/MovieRatings';
import { SeriesSeasons } from '@/components/movies/SeriesSeasons';
import { WatchButtons } from '@/components/movies/WatchButtons';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { MovieDetails } from '@/lib/movie-data';
import { normalizeStoredGenres } from '@/lib/movie-merge';
import { getComments, type MovieComment } from '@/server/comments';
import { getMovie, rateMovie } from '@/server/movies';

function trailerEmbedUrl(url: string) {
    try {
        const parsed = new URL(url);
        if (parsed.hostname.includes('youtube.com')) {
            const id = parsed.searchParams.get('v');
            return id ? `https://www.youtube.com/embed/${id}` : null;
        }
        if (parsed.hostname === 'youtu.be') {
            const id = parsed.pathname.replace(/^\/+/, '');
            return id ? `https://www.youtube.com/embed/${id}` : null;
        }
        if (parsed.hostname.includes('vimeo.com')) {
            const id = parsed.pathname.split('/').filter(Boolean)[0];
            return id ? `https://player.vimeo.com/video/${id}` : null;
        }
    } catch {
        return null;
    }
    return null;
}

function seriesMeta(movie: { seasonsCount: number | null; episodesPerSeason: number[] }) {
    const seasons = movie.seasonsCount ? `${movie.seasonsCount} сез.` : null;
    const episodesPerSeason = movie.episodesPerSeason ?? [];
    const episodes = episodesPerSeason.length
        ? `${episodesPerSeason.map((count, index) => `${index + 1}: ${count}`).join(', ')} сер.`
        : null;
    return [ seasons, episodes ].filter(Boolean).join(' · ');
}

function watchLinkLabel(url: string) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
}

function safeReturnPath(value?: string) {
    if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
    return value;
}

function TrailerSection({ movie }: { movie: Pick<MovieDetails, 'title' | 'trailerUrls'> }) {
    if (movie.trailerUrls.length === 0) return null;

    return (
        <section className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Clapperboard className="size-5 text-primary"/>
                {movie.trailerUrls.length > 1 ? 'Трейлеры' : 'Трейлер'}
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
                {movie.trailerUrls.map((url, index) => {
                    const embedUrl = trailerEmbedUrl(url);
                    return embedUrl ? (
                        <div
                            key={`${url}-${index}`}
                            className="aspect-video overflow-hidden rounded-lg border border-border bg-background"
                        >
                            <iframe
                                src={embedUrl}
                                title={`Трейлер ${index + 1}: ${movie.title}`}
                                className="size-full"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                allowFullScreen
                            />
                        </div>
                    ) : (
                        <Button key={`${url}-${index}`} asChild variant="outline" className="self-start">
                            <a href={url} target="_blank" rel="noreferrer">
                                <PlayCircle/>
                                Открыть трейлер {movie.trailerUrls.length > 1 ? index + 1 : ''}
                                <ExternalLink/>
                            </a>
                        </Button>
                    );
                })}
            </div>
        </section>
    );
}

function WatchLinksSection({ movie }: { movie: Pick<MovieDetails, 'watchLinks'> }) {
    if (movie.watchLinks.length === 0) return null;

    return (
        <section className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Globe className="size-5 text-primary"/>
                Где смотреть
            </h2>
            <div className="flex flex-wrap gap-2">
                {movie.watchLinks.map((url, index) => (
                    <Button key={`${url}-${index}`} asChild variant="outline" size="sm">
                        <a href={url} target="_blank" rel="noreferrer">
                            {watchLinkLabel(url)}
                            <ExternalLink/>
                        </a>
                    </Button>
                ))}
            </div>
        </section>
    );
}

function AboutSection({ movie, comments, isAuthed, onRate }: {
    movie: MovieDetails;
    comments: MovieComment[];
    isAuthed: boolean;
    onRate: (value: number) => void;
}) {
    return (
        <div className="flex flex-col gap-6">
            <TrailerSection movie={movie}/>
            <section className="flex flex-col gap-4">
                <h2 className="text-lg font-semibold">Описание</h2>
                <p className="whitespace-pre-line leading-relaxed text-foreground/90">
                    {movie.description}
                </p>
            </section>
            <MovieRatings
                externalRatings={movie.externalRatings}
                avgRating={movie.avgRating}
                ratingCount={movie.ratingCount}
                myRating={movie.myRating}
                isAuthed={isAuthed}
                onRate={onRate}
            />
            <MovieCast cast={movie.cast} legacyStarring={movie.starring}/>
            <WatchLinksSection movie={movie}/>
            <CommentsSection
                movieId={movie.id}
                comments={comments}
                isAuthed={isAuthed}
            />
        </div>
    );
}

function SeriesTabs({ movie, comments, isAuthed, onRate }: {
    movie: MovieDetails;
    comments: MovieComment[];
    isAuthed: boolean;
    onRate: (value: number) => void;
}) {
    return (
        <Tabs defaultValue="about" className="gap-5">
            <TabsList className="h-auto w-full justify-start gap-6 overflow-x-auto rounded-none border-b border-border/60 bg-transparent p-0">
                <TabsTrigger
                    value="about"
                    className="h-11 rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 text-base data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                    О сериале
                </TabsTrigger>
                <TabsTrigger
                    value="seasons"
                    className="h-11 rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 text-base data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                    Сезоны и серии
                </TabsTrigger>
            </TabsList>
            <TabsContent value="about">
                <AboutSection movie={movie} comments={comments} isAuthed={isAuthed} onRate={onRate}/>
            </TabsContent>
            <TabsContent value="seasons">
                <SeriesSeasons movie={movie}/>
            </TabsContent>
        </Tabs>
    );
}

export const Route = createFileRoute('/movies/$movieId')({
    validateSearch: z.object({
        from: z.string().optional(),
    }),
    loader: async ({ params }) => {
        const [ movie, comments ] = await Promise.all([
            getMovie({ data: { id: params.movieId } }),
            getComments({ data: { movieId: params.movieId } }),
        ]);
        if (!movie) throw notFound();
        return { movie, comments };
    },
    component: MoviePage,
    notFoundComponent: () => (
        <div className="flex flex-col items-center gap-4 py-20">
            <p className="text-lg text-muted-foreground">Фильм не найден</p>
            <Button asChild variant="outline">
                <Link to="/">На главную</Link>
            </Button>
        </div>
    ),
});

function MoviePage() {
    const { movie, comments } = Route.useLoaderData();
    const { from } = Route.useSearch();
    const { user } = Route.useRouteContext();
    const router = useRouter();
    const displayGenres = normalizeStoredGenres(movie.genres);
    const backTo = safeReturnPath(from);
    const headerLeading = useMemo(() => (
        <Button asChild variant="ghost" size="icon" aria-label="Назад">
            <a href={backTo}>
                <ArrowLeft/>
            </a>
        </Button>
    ), [ backTo ]);
    const headerActions = useMemo(() => movie.canEdit ? (
        <Button asChild size="sm" className="w-8 px-0" aria-label="Редактировать">
            <Link to="/movies/$movieId/edit" params={{ movieId: movie.id }}>
                <Pencil/>
            </Link>
        </Button>
    ) : null, [ movie.canEdit, movie.id ]);

    const handleRate = async (value: number) => {
        const result = await rateMovie({ data: { movieId: movie.id, value } });
        if (result.ok) {
            toast.success(`Ваша оценка: ${value} из 5`);
            await router.invalidate();
        } else {
            toast.error(result.error);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <PageTitle
                title={movie.title}
                leading={headerLeading}
                actions={headerActions}
            />

            <div className="flex flex-col gap-8 md:flex-row">
                <div className="w-full max-w-72 shrink-0 self-start overflow-hidden rounded-lg border border-border">
                    <MoviePoster posterUrl={movie.posterUrl} title={movie.title}/>
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-5">
                    <p className="text-muted-foreground">
                        {movie.year} · {movie.country}
                    </p>

                    {user ? (
                        <WatchButtons movieId={movie.id} current={movie.myWatchStatus}/>
                    ) : null}

                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                        {movie.director ? (
                            <span className="inline-flex items-center gap-1.5">
                                <User className="size-4"/>
                                Режиссёр: {movie.director}
                            </span>
                        ) : null}
                        {movie.durationMin ? (
                            <span className="inline-flex items-center gap-1.5">
                                <Clock className="size-4"/>
                                {movie.durationMin} мин
                            </span>
                        ) : null}
                        {movie.kind === 'SERIES' && seriesMeta(movie) ? (
                            <span className="inline-flex items-center gap-1.5">
                                <Tv className="size-4"/>
                                {seriesMeta(movie)}
                            </span>
                        ) : null}
                        <span className="inline-flex items-center gap-1.5">
                            <Globe className="size-4"/>
                            {movie.country}
                        </span>
                    </div>

                    {displayGenres.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                            {displayGenres.map((genre) => (
                                <span
                                    key={genre}
                                    className="rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground"
                                >
                                    {genre}
                                </span>
                            ))}
                        </div>
                    ) : null}

                    {movie.addedBy ? (
                        <p className="text-xs text-muted-foreground">
                            Добавил(а): {movie.addedBy}
                        </p>
                    ) : null}

                    {movie.kind === 'SERIES' ? (
                        <SeriesTabs
                            movie={movie}
                            comments={comments}
                            isAuthed={Boolean(user)}
                            onRate={handleRate}
                        />
                    ) : (
                        <AboutSection
                            movie={movie}
                            comments={comments}
                            isAuthed={Boolean(user)}
                            onRate={handleRate}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
