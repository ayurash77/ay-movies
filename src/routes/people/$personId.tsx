import { useMemo } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, MapPin, Ruler, UserRound } from 'lucide-react';

import { PageTitle } from '@/components/AppTitle';
import { PersonDetailSkeleton } from '@/components/loading/RouteSkeletons';
import { PersonFilmography } from '@/components/people/PersonFilmography';
import { Button } from '@/components/ui/button';
import { ProgressiveImage } from '@/components/ui/progressive-image';
import type { PersonProfile } from '@/lib/person-data';
import { getPerson } from '@/server/people';

const personDateFormatter = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
});

function formatPersonDate(value: string) {
    return personDateFormatter.format(new Date(`${value}T00:00:00.000Z`));
}

function personAge(birthDate: string | null, deathDate: string | null) {
    if (!birthDate) return null;
    const [ birthYear, birthMonth, birthDay ] = birthDate.split('-').map(Number);
    const end = deathDate ? new Date(`${deathDate}T00:00:00.000Z`) : new Date();
    let age = end.getUTCFullYear() - birthYear;
    if (end.getUTCMonth() + 1 < birthMonth
        || (end.getUTCMonth() + 1 === birthMonth && end.getUTCDate() < birthDay)) {
        age -= 1;
    }
    return age >= 0 ? age : null;
}

type PersonPageResult =
    | { ok: true; person: PersonProfile }
    | { ok: false; error: string };

export function personBackAction(historyLength: number) {
    return historyLength > 1 ? 'back' as const : 'home' as const;
}

export function PersonPortrait({ person }: { person: PersonProfile }) {
    return (
        <ProgressiveImage
            src={person.photoUrl ?? undefined}
            alt={person.name}
            loading="lazy"
            wrapperClassName="aspect-2/3 w-full"
            className="object-cover"
            fallback={(
                <div className="grid size-full place-items-center bg-muted">
                    <UserRound className="size-14 text-muted-foreground/55"/>
                </div>
            )}
        />
    );
}

function PersonSummary({ person }: { person: PersonProfile }) {
    const age = personAge(person.birthDate, person.deathDate);
    const rows = [
        person.professions.length ? [ 'Профессии', person.professions.join(', ') ] : null,
        person.sex ? [ 'Пол', person.sex ] : null,
        age != null ? [ 'Возраст', `${age}` ] : null,
        person.birthDate ? [ 'Дата рождения', formatPersonDate(person.birthDate) ] : null,
        person.birthPlace.length ? [ 'Место рождения', person.birthPlace.join(', ') ] : null,
        person.growthCm ? [ 'Рост', `${person.growthCm} см` ] : null,
        person.deathDate ? [ 'Дата смерти', formatPersonDate(person.deathDate) ] : null,
    ].filter((row): row is [ string, string ] => Boolean(row));

    return (
        <section className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="w-36 shrink-0 overflow-hidden rounded-md border border-border sm:w-40">
                <PersonPortrait person={person}/>
            </div>
            <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold">{person.name}</h1>
                {person.originalName && person.originalName !== person.name ? (
                    <p className="mt-1 text-sm text-muted-foreground">{person.originalName}</p>
                ) : null}
                <dl className="mt-4 grid gap-x-5 gap-y-2 text-sm sm:grid-cols-[8.5rem_1fr]">
                    {rows.map(([ label, value ]) => (
                        <div key={label} className="contents">
                            <dt className="flex items-center gap-1.5 text-muted-foreground">
                                {label === 'Место рождения' ? <MapPin className="size-3.5"/> : null}
                                {label === 'Рост' ? <Ruler className="size-3.5"/> : null}
                                {label}
                            </dt>
                            <dd className="min-w-0 text-foreground/90">{value}</dd>
                        </div>
                    ))}
                </dl>
            </div>
        </section>
    );
}

export function PersonPageContent({ result }: { result: PersonPageResult }) {
    return result.ok ? (
        <>
            <PersonSummary person={result.person}/>
            <PersonFilmography entries={result.person.filmography}/>
        </>
    ) : (
        <p className="py-16 text-center text-sm text-muted-foreground">{result.error}</p>
    );
}

export const Route = createFileRoute('/people/$personId')({
    loader: async ({ params }) => getPerson({ data: { personId: params.personId } }),
    pendingComponent: PersonDetailSkeleton,
    component: PersonPage,
});

function PersonPage() {
    const result = Route.useLoaderData();
    const navigate = useNavigate();
    const headerLeading = useMemo(() => (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Назад"
            onClick={() => {
                if (personBackAction(window.history.length) === 'back') window.history.back();
                else void navigate({ to: '/' });
            }}
        >
            <ArrowLeft/>
        </Button>
    ), [ navigate ]);

    return (
        <div className="flex flex-col gap-7">
            <PageTitle
                title={result.ok ? result.person.name : 'Персона'}
                leading={headerLeading}
            />
            <PersonPageContent result={result}/>
        </div>
    );
}
