import { useEffect, useState } from 'react';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { PageTitle } from '@/components/AppTitle';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { LookupCandidates } from '@/components/movies/LookupCandidates';
import { MovieForm } from '@/components/movies/MovieForm';
import { lookupMovieCandidates, type MovieLookupCandidate } from '@/server/movie-lookup';
import { createMovie } from '@/server/movies';
import { normalizeGenreOptions } from '@/lib/genre-groups';
import { movieKindOptions, type MovieFormFields } from '@/lib/movie-data';

export const Route = createFileRoute('/movies/new')({
    validateSearch: z.object({
        kind: z.enum(movieKindOptions).optional(),
    }),
    beforeLoad: ({ context, search }) => {
        if (!context.user) {
            throw redirect({
                to: '/sign-in',
                search: {
                    redirectTo: search.kind
                        ? `/movies/new?kind=${search.kind}`
                        : '/movies/new',
                },
            });
        }
    },
    component: NewMoviePage,
});

function candidateToFormDefaults(
    candidate: MovieLookupCandidate,
    fallbackTitle: string,
): Partial<MovieFormFields> {
    return {
        kind: candidate.kind ?? 'MOVIE',
        title: candidate.title ?? fallbackTitle,
        year: candidate.year ?? new Date().getFullYear(),
        country: candidate.country ?? '',
        description: candidate.description ?? '',
        director: candidate.director ?? '',
        genres: normalizeGenreOptions(candidate.genres ?? []),
        starring: candidate.starring?.join(', ') ?? '',
        durationMin: candidate.durationMin ?? '',
        seasonsCount: candidate.seasonsCount ?? '',
        episodesPerSeason: candidate.episodesPerSeason?.join(', ') ?? '',
        posterUrl: candidate.posterUrl ?? '',
    };
}

function NewMoviePage() {
    const navigate = useNavigate();
    const { kind } = Route.useSearch();
    const [ lookupTitle, setLookupTitle ] = useState('');
    const [ isLookingUp, setIsLookingUp ] = useState(false);
    const [ lookupDefaults, setLookupDefaults ] = useState<Partial<MovieFormFields>>({ kind: kind ?? 'MOVIE' });
    const [ lookupCandidates, setLookupCandidates ] = useState<MovieLookupCandidate[]>([]);

    useEffect(() => {
        setLookupDefaults((current) => ({ ...current, kind: kind ?? current.kind ?? 'MOVIE' }));
    }, [ kind ]);

    const handleLookup = async () => {
        const title = lookupTitle.trim();
        if (title.length < 2) return;

        setIsLookingUp(true);
        try {
            const result = await lookupMovieCandidates({ data: { title, kind } });
            if (!result.ok) {
                toast.error(result.error);
                setLookupCandidates([]);
                return;
            }

            setLookupCandidates(result.candidates);
        } catch {
            toast.error('Не удалось получить данные');
        } finally {
            setIsLookingUp(false);
        }
    };

    return (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
            <PageTitle title="Добавить фильм"/>
            <Card className="border-primary/30">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Search className="size-4 text-primary"/>
                        Быстрое заполнение
                    </CardTitle>
                    <CardDescription>
                        Введите название — приложение покажет найденные варианты. Выберите подходящий источник, чтобы заполнить форму.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            handleLookup();
                        }}
                        className="flex gap-2"
                    >
                        <Input
                            value={lookupTitle}
                            onChange={(e) => setLookupTitle(e.target.value)}
                            placeholder="Например: Криминальное чтиво"
                            maxLength={200}
                            aria-label="Название для поиска"
                        />
                        <Button type="submit" disabled={isLookingUp || lookupTitle.trim().length < 2}>
                            {isLookingUp ? 'Ищем…' : 'Найти'}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <LookupCandidates
                candidates={lookupCandidates}
                onReject={() => setLookupCandidates([])}
                onSelect={(candidate) => {
                    setLookupDefaults(candidateToFormDefaults(candidate, lookupTitle.trim()));
                    setLookupCandidates([]);
                    toast.success('Данные подставлены — проверьте перед сохранением');
                }}
            />

            <Card>
                <CardContent>
                    <MovieForm
                        key={JSON.stringify(lookupDefaults)}
                        defaults={lookupDefaults}
                        submitLabel="Добавить фильм"
                        onSubmit={async (fields) => {
                            const result = await createMovie({ data: fields });
                            if (result.ok) {
                                toast.success(result.existing
                                    ? 'Такой фильм уже есть — открываю карточку'
                                    : 'Фильм добавлен');
                                navigate({ to: '/movies/$movieId', params: { movieId: result.movieId } });
                            } else {
                                toast.error(result.error);
                            }
                        }}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
