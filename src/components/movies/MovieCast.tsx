import { useId, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { UserRound, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { MovieCastPerson } from '@/lib/movie-data';

const INITIAL_CAST_COUNT = 8;

function CastPortrait({ member }: { member: MovieCastPerson }) {
    const [ failed, setFailed ] = useState(false);

    if (!member.photoUrl || failed) {
        return (
            <div className="grid size-12 shrink-0 place-items-center rounded-full bg-muted">
                <UserRound className="size-5 text-muted-foreground/55"/>
            </div>
        );
    }

    return (
        <img
            src={member.photoUrl}
            alt=""
            loading="lazy"
            onError={() => setFailed(true)}
            className="size-12 shrink-0 rounded-full object-cover"
        />
    );
}

export function MovieCast({ cast, legacyStarring }: { cast: MovieCastPerson[]; legacyStarring: string[] }) {
    const [ expanded, setExpanded ] = useState(false);
    const castGridId = useId();

    if (cast.length === 0) {
        if (legacyStarring.length === 0) return null;
        return (
            <section className="flex flex-col gap-3">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <Users className="size-5 text-primary"/>
                    Актёры
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                    {legacyStarring.join(', ')}
                </p>
            </section>
        );
    }

    const visibleCast = expanded ? cast : cast.slice(0, INITIAL_CAST_COUNT);

    return (
        <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <Users className="size-5 text-primary"/>
                    Актёры
                </h2>
                {cast.length > INITIAL_CAST_COUNT ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-expanded={expanded}
                        aria-controls={castGridId}
                        onClick={() => setExpanded((value) => !value)}
                    >
                        {expanded ? 'Свернуть' : 'Все'}
                    </Button>
                ) : null}
            </div>
            <div id={castGridId} className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visibleCast.map((member) => (
                    <Link
                        key={member.personId}
                        to="/people/$personId"
                        params={{ personId: member.personId }}
                        className="group flex min-w-0 items-center gap-2 rounded-md border border-card-border bg-card p-2 shadow-[0_8px_20px_rgb(0_0_0/0.16)] transition-colors hover:border-primary/60"
                    >
                        <CastPortrait member={member}/>
                        <div className="min-w-0">
                            <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug group-hover:text-primary">
                                {member.name}
                            </h3>
                            {member.role ? (
                                <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                                    {member.role}
                                </p>
                            ) : null}
                        </div>
                    </Link>
                ))}
            </div>
        </section>
    );
}
