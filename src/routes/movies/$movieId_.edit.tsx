import { useRef, useState } from 'react';
import { createFileRoute, Link, notFound, redirect, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { PageTitle } from '@/components/AppTitle';
import {
    LookupCandidates,
    lookupCandidateKey,
    type LookupCandidate,
} from '@/components/movies/LookupCandidates';
import { MovieForm } from '@/components/movies/MovieForm';
import { MovieFormFooter } from '@/components/movies/MovieFormFooter';
import type { MovieFormFields } from '@/lib/movie-data';
import { getMovie, updateMovie } from '@/server/movies';
import { loadMovieLookupDetails, lookupMovieCandidates, type MovieLookupCandidate } from '@/server/movie-lookup';
import { normalizeGenreOptions } from '@/lib/genre-groups';
import {
    hasUsableMovieLookupDetails,
    movieLookupFormMetadata,
} from '@/lib/movie-lookup-details';
import type { MovieLookupDetails } from '@/lib/movie-lookup-types';

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
        metadataProvider: movie.metadataProvider,
        metadataExternalId: movie.metadataExternalId,
        seriesSeasons: movie.seriesSeasons,
        externalRatings: movie.externalRatings,
        cast: movie.cast,
        videos: movie.videos,
    };
}

function mergeLookupDefaults(
    current: Partial<MovieFormFields>,
    lookup: LookupCandidate,
): Partial<MovieFormFields> {
    const metadata = movieLookupFormMetadata(lookup, current);
    const hasSnapshot = metadata.metadataImportSucceeded && lookup.kind === 'SERIES';

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
        seasonsCount: hasSnapshot ? lookup.seasonsCount ?? current.seasonsCount : current.seasonsCount,
        episodesPerSeason: hasSnapshot && lookup.episodesPerSeason?.length
            ? lookup.episodesPerSeason.join(', ')
            : current.episodesPerSeason,
        metadataProvider: lookup.provider,
        metadataExternalId: lookup.externalId ?? null,
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
    const formId = 'edit-movie-form';
    const [ formDefaults, setFormDefaults ] = useState<Partial<MovieFormFields>>(() => movieToFormDefaults(movie));
    const [ formVersion, setFormVersion ] = useState(0);
    const [ isRefreshing, setIsRefreshing ] = useState(false);
    const [ isSubmitting, setIsSubmitting ] = useState(false);
    const [ lookupCandidates, setLookupCandidates ] = useState<LookupCandidate[]>([]);
    const [ loadingCandidateKey, setLoadingCandidateKey ] = useState<string | null>(null);
    const [ submitImportedSeriesSnapshot, setSubmitImportedSeriesSnapshot ] = useState(false);
    const [ metadataImportSucceeded, setMetadataImportSucceeded ] = useState(false);
    const requestGeneration = useRef(0);
    const applyingCandidateRef = useRef(false);
    const refreshingRef = useRef(false);
    const isApplyingCandidate = loadingCandidateKey !== null;

    const handleRefreshMetadata = async () => {
        if (applyingCandidateRef.current || refreshingRef.current) return;
        const title = String(formDefaults.title || movie.title).trim();
        if (!title) return;

        const generation = ++requestGeneration.current;
        refreshingRef.current = true;
        setIsRefreshing(true);
        try {
            if (movie.metadataProvider && movie.metadataExternalId) {
                const detailedResult = await loadMovieLookupDetails({
                    data: {
                        provider: movie.metadataProvider,
                        externalId: movie.metadataExternalId,
                    },
                });
                if (generation !== requestGeneration.current || applyingCandidateRef.current) return;
                if (detailedResult.ok) {
                    setLookupCandidates([ detailedResult.movie ]);
                    return;
                }
                toast.warning('Не удалось обновить сохранённый источник. Выполняю поиск по названию.');
            }

            const result = await lookupMovieCandidates({ data: { title } });
            if (generation !== requestGeneration.current || applyingCandidateRef.current) return;
            if (!result.ok) {
                toast.error(result.error);
                setLookupCandidates([]);
                return;
            }
            setLookupCandidates(result.candidates);
        } catch {
            if (generation === requestGeneration.current && !applyingCandidateRef.current) {
                toast.error('Не удалось обновить данные');
            }
        } finally {
            if (generation === requestGeneration.current) {
                refreshingRef.current = false;
                setIsRefreshing(false);
            }
        }
    };

    const applyLookupCandidate = async (candidate: LookupCandidate) => {
        if (applyingCandidateRef.current || refreshingRef.current) return;

        const candidateKey = lookupCandidateKey(candidate);
        const generation = ++requestGeneration.current;
        applyingCandidateRef.current = true;
        setLoadingCandidateKey(candidateKey);
        setSubmitImportedSeriesSnapshot(false);
        setMetadataImportSucceeded(false);

        try {
            let selectedCandidate = candidate;
            if (!hasDetailedSeasons(candidate) && canLoadCandidateDetails(candidate)) {
                const detailedResult = await loadMovieLookupDetails({
                    data: { provider: candidate.provider, externalId: candidate.externalId! },
                });

                if (detailedResult.ok && hasUsableMovieLookupDetails(detailedResult.movie)) {
                    selectedCandidate = detailedResult.movie;
                } else if (!detailedResult.ok || candidate.kind === 'SERIES') {
                    toast.warning('Подробные данные о сериях недоступны. Использованы основные данные.');
                }
            }

            if (generation !== requestGeneration.current) return;

            const metadataImportSucceeded = movieLookupFormMetadata(selectedCandidate)
                .metadataImportSucceeded;
            setFormDefaults((current) => mergeLookupDefaults(current, selectedCandidate));
            setMetadataImportSucceeded(metadataImportSucceeded);
            setSubmitImportedSeriesSnapshot(
                metadataImportSucceeded
                && selectedCandidate.kind === 'SERIES',
            );
            setLookupCandidates([]);
            setFormVersion((current) => current + 1);
            toast.success('Данные подставлены — проверьте перед сохранением');
        } catch {
            if (generation !== requestGeneration.current) return;
            toast.warning('Подробные данные недоступны. Использованы основные данные.');
            setFormDefaults((current) => mergeLookupDefaults(current, candidate));
            setSubmitImportedSeriesSnapshot(false);
            setMetadataImportSucceeded(false);
            setLookupCandidates([]);
            setFormVersion((current) => current + 1);
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
        refreshingRef.current = false;
        setIsRefreshing(false);
        setLookupCandidates([]);
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
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-28">
                <div className="flex justify-end">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleRefreshMetadata}
                        disabled={isRefreshing || isApplyingCandidate}
                    >
                        <RefreshCw className={isRefreshing ? 'animate-spin' : undefined}/>
                        {isRefreshing ? 'Обновление…' : 'Обновить данные'}
                    </Button>
                </div>
                <LookupCandidates
                    candidates={lookupCandidates}
                    onReject={rejectLookupCandidates}
                    onSelect={applyLookupCandidate}
                    loadingCandidateKey={loadingCandidateKey}
                />
                <MovieForm
                    key={formVersion}
                    formId={formId}
                    hideSubmitButton
                    onSubmittingChange={setIsSubmitting}
                    submitLabel="Сохранить"
                    defaults={formDefaults}
                    submitImportedSeriesSnapshot={submitImportedSeriesSnapshot}
                    metadataImportSucceeded={metadataImportSucceeded}
                    submitDisabled={isApplyingCandidate}
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
                <MovieFormFooter
                    formId={formId}
                    submitLabel="Сохранить"
                    isSubmitting={isSubmitting}
                    disabled={isApplyingCandidate}
                    onCancel={() => navigate({ to: '/movies/$movieId', params: { movieId: movie.id } })}
                />
            </div>
        </>
    );
}
