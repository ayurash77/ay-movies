import type { MovieLookupCandidate, MovieLookupDetails } from '@/lib/movie-lookup-types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export type LookupCandidate = MovieLookupCandidate | MovieLookupDetails;

type LookupCandidatesProps = {
    candidates: LookupCandidate[];
    onSelect: (candidate: LookupCandidate) => void;
    onReject: () => void;
    loadingCandidateKey?: string | null;
};

const KIND_LABELS = {
    MOVIE: 'Фильм',
    SERIES: 'Сериал',
    CARTOON: 'Мультфильм',
} as const;

function formatSeries(candidate: MovieLookupCandidate) {
    if (candidate.kind !== 'SERIES') return null;
    if (candidate.episodesPerSeason?.length) {
        const total = candidate.episodesPerSeason.reduce((sum, count) => sum + count, 0);
        return `${candidate.episodesPerSeason.length} сез., ${total} сер.`;
    }
    return candidate.seasonsCount ? `${candidate.seasonsCount} сез.` : null;
}

function formatRating(candidate: MovieLookupCandidate) {
    return typeof candidate.rating === 'number'
        ? `kp ${candidate.rating.toFixed(1).replace(/\.0$/, '')}`
        : null;
}

export function lookupCandidateKey(candidate: MovieLookupCandidate) {
    return `${candidate.provider}:${candidate.externalId ?? candidate.title ?? ''}:${candidate.year ?? ''}`;
}

export function LookupCandidates({
    candidates,
    onSelect,
    onReject,
    loadingCandidateKey,
}: LookupCandidatesProps) {
    if (!candidates.length) return null;
    const isBusy = Boolean(loadingCandidateKey);

    return (
        <section className="flex flex-col gap-3" aria-label="Найденные варианты">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="text-sm font-semibold">Выберите источник данных</p>
                    <p className="text-xs text-muted-foreground">Форма заполнится только после выбора карточки.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={onReject} disabled={isBusy}>
                    Не подходит
                </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                {candidates.map((candidate, index) => {
                    const candidateKey = lookupCandidateKey(candidate) || String(index);
                    const isApplyingCandidate = loadingCandidateKey === candidateKey;
                    const series = formatSeries(candidate);
                    const meta = [
                        candidate.kind ? KIND_LABELS[candidate.kind] : null,
                        candidate.year,
                        candidate.country,
                        series,
                        formatRating(candidate),
                    ].filter(Boolean);

                    return (
                        <Card key={candidateKey} className="py-3">
                            <CardContent className="flex gap-3 px-3">
                                <div className="h-28 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
                                    {candidate.posterUrl ? (
                                        <img
                                            src={candidate.posterUrl}
                                            alt=""
                                            className="h-full w-full object-cover"
                                            loading="lazy"
                                        />
                                    ) : null}
                                </div>
                                <div className="flex min-w-0 flex-1 flex-col gap-2">
                                    <div className="min-w-0">
                                        <div className="mb-1 inline-flex rounded bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                                            {candidate.providerLabel}
                                        </div>
                                        <p className="truncate text-sm font-semibold">{candidate.title}</p>
                                        {candidate.originalTitle ? (
                                            <p className="truncate text-xs text-muted-foreground">
                                                {candidate.originalTitle}
                                            </p>
                                        ) : null}
                                    </div>
                                    {meta.length ? (
                                        <p className="text-xs text-muted-foreground">{meta.join(' / ')}</p>
                                    ) : null}
                                    {candidate.genres?.length ? (
                                        <p className="line-clamp-1 text-xs text-muted-foreground">
                                            {candidate.genres.join(', ')}
                                        </p>
                                    ) : null}
                                    {candidate.description ? (
                                        <p className="line-clamp-2 text-xs text-muted-foreground">
                                            {candidate.description}
                                        </p>
                                    ) : null}
                                    <Button
                                        type="button"
                                        size="sm"
                                        className="mt-auto self-start"
                                        onClick={() => onSelect(candidate)}
                                        disabled={isBusy}
                                    >
                                        {isApplyingCandidate ? 'Загрузка...' : 'Заполнить'}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </section>
    );
}
