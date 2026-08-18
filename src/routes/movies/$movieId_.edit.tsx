import { createFileRoute, Link, notFound, redirect, useNavigate } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { PageTitle } from '@/components/AppTitle';
import { Card, CardContent } from '@/components/ui/card';
import { MovieForm } from '@/components/movies/MovieForm';
import { getMovie, updateMovie } from '@/server/movies';
import { normalizeGenreOptions } from '@/lib/genre-groups';

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
            <Card className="mx-auto w-full max-w-2xl">
                <CardContent>
                    <MovieForm
                        submitLabel="Сохранить"
                        defaults={{
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
                        }}
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
                </CardContent>
            </Card>
        </>
    );
}
