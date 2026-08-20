import { Link } from '@tanstack/react-router';

import { RatingStars } from './RatingStars';
import type { ExternalRatings } from '@/lib/movie-lookup-types';
import { formatRating } from '@/lib/utils';

const voteFormatter = new Intl.NumberFormat('ru-RU');

type MovieRatingsProps = {
    externalRatings: ExternalRatings;
    avgRating: number;
    ratingCount: number;
    myRating: number | null;
    isAuthed: boolean;
    onRate: (value: number) => void;
};

function RatingTile({ label, value, votes }: { label: string; value: string; votes?: number | null }) {
    return (
        <div className="flex min-h-24 flex-col justify-between gap-2 bg-card p-3">
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
            <div>
                <div className="text-xl font-semibold tabular-nums">{value}</div>
                {votes != null ? (
                    <div className="text-xs tabular-nums text-muted-foreground">
                        {voteFormatter.format(votes)} голосов
                    </div>
                ) : null}
            </div>
        </div>
    );
}

export function MovieRatings({
    externalRatings,
    avgRating,
    ratingCount,
    myRating,
    isAuthed,
    onRate,
}: MovieRatingsProps) {
    return (
        <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Рейтинги</h2>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-px overflow-hidden rounded-md border border-border bg-border">
                {externalRatings.kinopoisk ? (
                    <RatingTile
                        label="Кинопоиск"
                        value={`${formatRating(externalRatings.kinopoisk.value)} / 10`}
                        votes={externalRatings.kinopoisk.votes}
                    />
                ) : null}
                {externalRatings.imdb ? (
                    <RatingTile
                        label="IMDb"
                        value={`${formatRating(externalRatings.imdb.value)} / 10`}
                        votes={externalRatings.imdb.votes}
                    />
                ) : null}
                {externalRatings.russianCritics ? (
                    <RatingTile
                        label="Критики"
                        value={`${formatRating(externalRatings.russianCritics.value)}%`}
                        votes={externalRatings.russianCritics.votes}
                    />
                ) : null}
                <div className="flex min-h-24 flex-col justify-between gap-2 bg-card p-3">
                    <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-medium text-muted-foreground">AY Movies</span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                            {ratingCount > 0 ? `${voteFormatter.format(ratingCount)} голосов` : 'Нет оценок'}
                        </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <span className="text-xl font-semibold tabular-nums">
                            {ratingCount > 0 ? `${formatRating(avgRating)} / 5` : '—'}
                        </span>
                        {isAuthed ? (
                            <RatingStars value={myRating ?? 0} onRate={onRate}/>
                        ) : (
                            <Link to="/sign-in" className="text-xs text-primary hover:underline">
                                Войти и оценить
                            </Link>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}
