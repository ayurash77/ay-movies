import { createFileRoute, Link, notFound, useRouter } from '@tanstack/react-router';
import { ArrowLeft, Clock, Clapperboard, ExternalLink, Globe, Pencil, PlayCircle, Tv, User, Users } from 'lucide-react';
import { toast } from 'sonner';

import { PageTitle } from '@/components/AppTitle';
import { CommentsSection } from '@/components/movies/CommentsSection';
import { MoviePoster } from '@/components/movies/MoviePoster';
import { RatingStars } from '@/components/movies/RatingStars';
import { WatchButtons } from '@/components/movies/WatchButtons';
import { Button } from '@/components/ui/button';
import { formatRating } from '@/lib/utils';
import { getComments } from '@/server/comments';
import { getMovie, rateMovie } from '@/server/movies';

function trailerEmbedUrl(url: string | null) {
    if (!url) return null;
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

export const Route = createFileRoute('/movies/$movieId')({
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
    const { user } = Route.useRouteContext();
    const router = useRouter();
    const trailerUrl = trailerEmbedUrl(movie.trailerUrl);

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
            <PageTitle title={movie.title}/>
            <div className="flex items-center justify-between">
                <Button asChild variant="ghost" size="sm">
                    <Link to="/">
                        <ArrowLeft/>
                        Назад
                    </Link>
                </Button>
                {movie.canEdit ? (
                    <Button asChild variant="outline" size="sm">
                        <Link to="/movies/$movieId/edit" params={{ movieId: movie.id }}>
                            <Pencil/>
                            Редактировать
                        </Link>
                    </Button>
                ) : null}
            </div>

            <div className="flex flex-col gap-8 md:flex-row">
                <div className="w-full max-w-72 shrink-0 self-start overflow-hidden rounded-lg border border-border">
                    <MoviePoster posterUrl={movie.posterUrl} title={movie.title}/>
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-5">
                    <p className="text-muted-foreground">
                        {movie.year} · {movie.country}
                    </p>

                    <div className="flex items-center gap-3">
                        <RatingStars value={movie.avgRating}/>
                        <span className="text-sm text-muted-foreground">
                            {movie.ratingCount > 0
                                ? `${formatRating(movie.avgRating)} · ${movie.ratingCount} оцен.`
                                : 'Оценок пока нет'}
                        </span>
                    </div>

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

                    {movie.genres.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                            {movie.genres.map((genre) => (
                                <span
                                    key={genre}
                                    className="rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground"
                                >
                                    {genre}
                                </span>
                            ))}
                        </div>
                    ) : null}

                    {movie.starring.length > 0 ? (
                        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                            <Users className="mt-0.5 size-4 shrink-0"/>
                            <span>
                                <span className="font-medium text-foreground">В главных ролях: </span>
                                {movie.starring.join(', ')}
                            </span>
                        </p>
                    ) : null}

                    <p className="whitespace-pre-line leading-relaxed text-foreground/90">
                        {movie.description}
                    </p>

                    {movie.trailerUrl ? (
                        <section className="flex flex-col gap-3">
                            <h2 className="flex items-center gap-2 text-lg font-semibold">
                                <Clapperboard className="size-5 text-primary"/>
                                Трейлер
                            </h2>
                            {trailerUrl ? (
                                <div className="aspect-video overflow-hidden rounded-lg border border-border bg-background">
                                    <iframe
                                        src={trailerUrl}
                                        title={`Трейлер: ${movie.title}`}
                                        className="size-full"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                        allowFullScreen
                                    />
                                </div>
                            ) : (
                                <Button asChild variant="outline" className="self-start">
                                    <a href={movie.trailerUrl} target="_blank" rel="noreferrer">
                                        <PlayCircle/>
                                        Открыть трейлер
                                        <ExternalLink/>
                                    </a>
                                </Button>
                            )}
                        </section>
                    ) : null}

                    {movie.watchLinks.length > 0 ? (
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
                    ) : null}

                    <div className="mt-2 rounded-lg border border-border bg-card p-4">
                        {user ? (
                            <div className="flex flex-col gap-2">
                                <span className="text-sm font-medium">
                                    {movie.myRating
                                        ? `Ваша оценка: ${movie.myRating} из 5`
                                        : 'Оцените фильм'}
                                </span>
                                <RatingStars
                                    value={movie.myRating ?? 0}
                                    onRate={handleRate}
                                    size="lg"
                                />
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                <Link to="/sign-in" className="text-primary hover:underline">
                                    Войдите
                                </Link>
                                , чтобы оценить фильм
                            </p>
                        )}
                    </div>

                    {movie.addedBy ? (
                        <p className="text-xs text-muted-foreground">
                            Добавил(а): {movie.addedBy}
                        </p>
                    ) : null}

                    <CommentsSection
                        movieId={movie.id}
                        comments={comments}
                        isAuthed={Boolean(user)}
                    />
                </div>
            </div>
        </div>
    );
}
