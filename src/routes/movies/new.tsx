import { useEffect, useRef, useState } from 'react';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { PageTitle } from '@/components/AppTitle';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
    LookupCandidates,
    lookupCandidateKey,
    type LookupCandidate,
} from '@/components/movies/LookupCandidates';
import { MovieForm } from '@/components/movies/MovieForm';
import { MovieFormFooter } from '@/components/movies/MovieFormFooter';
import { loadMovieLookupDetails, lookupMovieCandidates, type MovieLookupCandidate } from '@/server/movie-lookup';
import { createMovie } from '@/server/movies';
import { normalizeGenreOptions } from '@/lib/genre-groups';
import { movieKindOptions, type MovieFormFields } from '@/lib/movie-data';
import {
    hasUsableMovieLookupDetails,
    movieLookupFormMetadata,
} from '@/lib/movie-lookup-details';
import type { MovieLookupDetails } from '@/lib/movie-lookup-types';

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
    candidate: LookupCandidate,
    fallbackTitle: string,
): Partial<MovieFormFields> {
    const metadata = movieLookupFormMetadata(candidate);

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
        metadataProvider: candidate.provider,
        metadataExternalId: candidate.externalId ?? null,
        seriesSeasons: metadata.seriesSeasons,
        externalRatings: metadata.externalRatings,
        cast: metadata.cast,
        videos: metadata.videos,
    };
}

function canLoadCandidateDetails(candidate: MovieLookupCandidate) {
    return Boolean(
        candidate.externalId
        && !/^Q\d+$/i.test(candidate.externalId)
        && (candidate.provider === 'kinopoisk-dev' || candidate.provider === 'kinopoisk-unofficial'),
    );
}

function hasDetailedSeasons(candidate: LookupCandidate): candidate is MovieLookupDetails {
    return 'seasons' in candidate;
}

function NewMoviePage() {
    const navigate = useNavigate();
    const { kind } = Route.useSearch();
    const formId = 'new-movie-form';
    const [ lookupTitle, setLookupTitle ] = useState('');
    const [ isLookingUp, setIsLookingUp ] = useState(false);
    const [ isSubmitting, setIsSubmitting ] = useState(false);
    const [ lookupDefaults, setLookupDefaults ] = useState<Partial<MovieFormFields>>({ kind: kind ?? 'MOVIE' });
    const [ lookupCandidates, setLookupCandidates ] = useState<LookupCandidate[]>([]);
    const [ loadingCandidateKey, setLoadingCandidateKey ] = useState<string | null>(null);
    const [ submitImportedSeriesSnapshot, setSubmitImportedSeriesSnapshot ] = useState(false);
    const [ metadataImportSucceeded, setMetadataImportSucceeded ] = useState(false);
    const requestGeneration = useRef(0);
    const applyingCandidateRef = useRef(false);
    const lookingUpRef = useRef(false);
    const isApplyingCandidate = loadingCandidateKey !== null;

    useEffect(() => {
        setLookupDefaults((current) => ({ ...current, kind: kind ?? current.kind ?? 'MOVIE' }));
    }, [ kind ]);

    const handleLookup = async () => {
        if (applyingCandidateRef.current || lookingUpRef.current) return;
        const title = lookupTitle.trim();
        if (title.length < 2) return;

        const generation = ++requestGeneration.current;
        setLookupCandidates([]);
        lookingUpRef.current = true;
        setIsLookingUp(true);
        try {
            const result = await lookupMovieCandidates({ data: { title, kind } });
            if (generation !== requestGeneration.current || applyingCandidateRef.current) return;
            if (!result.ok) {
                toast.error(result.error);
                setLookupCandidates([]);
                return;
            }

            setLookupCandidates(result.candidates);
        } catch {
            if (generation === requestGeneration.current && !applyingCandidateRef.current) {
                toast.error('Не удалось получить данные');
            }
        } finally {
            if (generation === requestGeneration.current) {
                lookingUpRef.current = false;
                setIsLookingUp(false);
            }
        }
    };

    const applyLookupCandidate = async (candidate: LookupCandidate) => {
        if (applyingCandidateRef.current || lookingUpRef.current) return;

        const candidateKey = lookupCandidateKey(candidate);
        const generation = ++requestGeneration.current;
        applyingCandidateRef.current = true;
        lookingUpRef.current = false;
        setIsLookingUp(false);
        setLoadingCandidateKey(candidateKey);
        setSubmitImportedSeriesSnapshot(false);
        setMetadataImportSucceeded(false);

        try {
            let selectedCandidate = candidate;
            if (!hasDetailedSeasons(candidate) && canLoadCandidateDetails(candidate)) {
                const result = await loadMovieLookupDetails({
                    data: { provider: candidate.provider, externalId: candidate.externalId! },
                });

                if (result.ok && hasUsableMovieLookupDetails(result.movie)) {
                    selectedCandidate = result.movie;
                } else if (!result.ok || candidate.kind === 'SERIES') {
                    toast.warning('Подробные данные о сериях недоступны. Использованы основные данные.');
                }
            }

            if (generation !== requestGeneration.current) return;

            const metadataImportSucceeded = movieLookupFormMetadata(selectedCandidate)
                .metadataImportSucceeded;
            setLookupDefaults(candidateToFormDefaults(selectedCandidate, lookupTitle.trim()));
            setMetadataImportSucceeded(metadataImportSucceeded);
            setSubmitImportedSeriesSnapshot(
                metadataImportSucceeded
                && selectedCandidate.kind === 'SERIES',
            );
            setLookupCandidates([]);
            toast.success('Данные подставлены — проверьте перед сохранением');
        } catch {
            if (generation !== requestGeneration.current) return;
            toast.warning('Подробные данные недоступны. Использованы основные данные.');
            setLookupDefaults(candidateToFormDefaults(candidate, lookupTitle.trim()));
            setSubmitImportedSeriesSnapshot(false);
            setMetadataImportSucceeded(false);
            setLookupCandidates([]);
        } finally {
            if (generation === requestGeneration.current) {
                setLoadingCandidateKey(null);
            }
            applyingCandidateRef.current = false;
        }
    };

    const rejectLookupCandidates = () => {
        if (applyingCandidateRef.current) return;

        ++requestGeneration.current;
        lookingUpRef.current = false;
        setIsLookingUp(false);
        setLookupCandidates([]);
    };

    const handleCancel = () => {
        if (window.history.length > 1) {
            window.history.back();
            return;
        }
        navigate({ to: '/' });
    };

    return (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 pb-28">
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
                        <Button type="submit" disabled={isLookingUp || isApplyingCandidate || lookupTitle.trim().length < 2}>
                            {isLookingUp ? 'Ищем…' : 'Найти'}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <LookupCandidates
                candidates={lookupCandidates}
                onReject={rejectLookupCandidates}
                onSelect={applyLookupCandidate}
                loadingCandidateKey={loadingCandidateKey}
            />

            <Card>
                <CardContent>
                    <MovieForm
                        key={JSON.stringify(lookupDefaults)}
                        formId={formId}
                        hideSubmitButton
                        onSubmittingChange={setIsSubmitting}
                        defaults={lookupDefaults}
                        submitImportedSeriesSnapshot={submitImportedSeriesSnapshot}
                        metadataImportSucceeded={metadataImportSucceeded}
                        submitDisabled={isApplyingCandidate}
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
            <MovieFormFooter
                formId={formId}
                submitLabel="Добавить фильм"
                isSubmitting={isSubmitting}
                disabled={isApplyingCandidate}
                onCancel={handleCancel}
            />
        </div>
    );
}
