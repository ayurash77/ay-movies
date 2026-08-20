import { useState } from 'react';
import { createFileRoute, Link, notFound, redirect, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { PageTitle } from '@/components/AppTitle';
import { LookupCandidates } from '@/components/movies/LookupCandidates';
import { MovieForm } from '@/components/movies/MovieForm';
import type { MovieFormFields } from '@/lib/movie-data';
import { getMovie, updateMovie } from '@/server/movies';
import { lookupMovieCandidates, type MovieLookupCandidate } from '@/server/movie-lookup';
import { normalizeGenreOptions } from '@/lib/genre-groups';

function movieToFormDefaults(movie: Awaited<ReturnType<typeof getMovie>>): Partial<MovieFormFields> {
    if (!movie) return {};
    return {
        kind: movie.kind,
        title: movie.title,
        year: movie.year,
        country: movie.country,
        description: movie.description,
        posterUrl: movie.posterUrl ?? '',
        trailerUrls: movie.trailerUrls,
        watchLinks: movie.watchLinks,
        director: movie.director ?? '',
        genres: normalizeGenreOptions(movie.genres),
        starring: movie.starring.join(', '),
        durationMin: movie.durationMin ?? '',
        seasonsCount: movie.seasonsCount ?? '',
        episodesPerSeason: movie.episodesPerSeason.join(', '),
    };
}

function mergeLookupDefaults(
    current: Partial<MovieFormFields>,
    lookup: MovieLookupCandidate,
): Partial<MovieFormFields> {
    return {
        ...current,
        kind: lookup.kind ?? current.kind,
        title: lookup.title ?? current.title,
        year: lookup.year ?? current.year,
        country: lookup.country ?? current.country,
        description: lookup.description ?? current.description,
        posterUrl: current.posterUrl || lookup.posterUrl || '',
        trailerUrls: current.trailerUrls,
        watchLinks: current.watchLinks,
        director: lookup.director ?? current.director,
        genres: lookup.genres?.length ? normalizeGenreOptions(lookup.genres) : current.genres,
        starring: lookup.starring?.length ? lookup.starring.join(', ') : current.starring,
        durationMin: lookup.durationMin ?? current.durationMin,
        seasonsCount: lookup.seasonsCount ?? current.seasonsCount,
        episodesPerSeason: lookup.episodesPerSeason?.length
            ? lookup.episodesPerSeason.join(', ')
            : current.episodesPerSeason,
    };
}

export const Route = createFileRoute('/movies/$movieId_/edit')({
    beforeLoad: ({ context, params }) => {
        if (!context.user) {
            throw redirect({
                to: '/sign-in',
                search: { redirectTo: `/movies/${params.movieId}/edit` },
            });
        }
    },
    loader: async ({ params }) => {
        const movie = await getMovie({ data: { id: params.movieId } });
        if (!movie) throw notFound();
        return movie;
    },
    component: EditMoviePage,
});

function EditMoviePage() {
    const movie = Route.useLoaderData();
    const navigate = useNavigate();
    const pageTitle = `Редактировать: ${movie.title}`;
    const [ formDefaults, setFormDefaults ] = useState<Partial<MovieFormFields>>(() => movieToFormDefaults(movie));
    const [ formVersion, setFormVersion ] = useState(0);
    const [ isRefreshing, setIsRefreshing ] = useState(false);
    const [ lookupCandidates, setLookupCandidates ] = useState<MovieLookupCandidate[]>([]);

    const handleRefreshMetadata = async () => {
        const title = String(formDefaults.title || movie.title).trim();
        if (!title) return;

        setIsRefreshing(true);
        try {
            const result = await lookupMovieCandidates({ data: { title, kind: formDefaults.kind } });
            if (!result.ok) {
                toast.error(result.error);
                setLookupCandidates([]);
                return;
            }
            setLookupCandidates(result.candidates);
        } catch {
            toast.error('Не удалось обновить данные');
        } finally {
            setIsRefreshing(false);
        }
    };

    if (!movie.canEdit) {
        return (
            <>
                <PageTitle title={pageTitle}/>
                <div className="flex flex-col items-center gap-4 py-20">
                    <p className="text-muted-foreground">Редактировать может только добавивший фильм</p>
                    <Button asChild variant="outline">
                        <Link to="/movies/$movieId" params={{ movieId: movie.id }}>
                            <ArrowLeft/>
                            К фильму
                        </Link>
                    </Button>
                </div>
            </>
        );
    }

    return (
        <>
            <PageTitle title={pageTitle}/>
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
                <div className="flex justify-end">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleRefreshMetadata}
                        disabled={isRefreshing}
                    >
                        <RefreshCw className={isRefreshing ? 'animate-spin' : undefined}/>
                        {isRefreshing ? 'Обновление…' : 'Обновить данные'}
                    </Button>
                </div>
                <LookupCandidates
                    candidates={lookupCandidates}
                    onReject={() => setLookupCandidates([])}
                    onSelect={(candidate) => {
                        setFormDefaults((current) => mergeLookupDefaults(current, candidate));
                        setLookupCandidates([]);
                        setFormVersion((current) => current + 1);
                        toast.success('Данные подставлены — проверьте перед сохранением');
                    }}
                />
                <MovieForm
                    key={formVersion}
                    submitLabel="Сохранить"
                    defaults={formDefaults}
                    onSubmit={async (fields) => {
                        const result = await updateMovie({ data: { ...fields, movieId: movie.id } });
                        if (result.ok) {
                            toast.success('Изменения сохранены');
                            navigate({ to: '/movies/$movieId', params: { movieId: movie.id } });
                        } else {
                            toast.error(result.error);
                            if ('movieId' in result && result.movieId && result.movieId !== movie.id) {
                                navigate({ to: '/movies/$movieId', params: { movieId: result.movieId } });
                            }
                        }
                    }}
                />
            </div>
        </>
    );
}
