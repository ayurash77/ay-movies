import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { UserRound, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { MovieCastPerson } from '@/lib/movie-data';

const INITIAL_CAST_COUNT = 8;

function CastPortrait({ member }: { member: MovieCastPerson }) {
    const [ failed, setFailed ] = useState(false);

    if (!member.photoUrl || failed) {
        return (
            <div className="grid aspect-2/3 w-full place-items-center bg-muted">
                <UserRound className="size-10 text-muted-foreground/55"/>
            </div>
        );
    }

    return (
        <img
            src={member.photoUrl}
            alt={member.name}
            loading="lazy"
            onError={() => setFailed(true)}
            className="aspect-2/3 w-full object-cover"
        />
    );
}

export function MovieCast({ cast, legacyStarring }: { cast: MovieCastPerson[]; legacyStarring: string[] }) {
    const [ expanded, setExpanded ] = useState(false);

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

    const visibleCast = expanded ? cast : cast.slice(0, 8);

    return (
        <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <Users className="size-5 text-primary"/>
                    Актёры
                </h2>
                {cast.length > INITIAL_CAST_COUNT ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded((value) => !value)}>
                        {expanded ? 'Свернуть' : 'Все'}
                    </Button>
                ) : null}
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-5">
                {visibleCast.map((member) => (
                    <Link
                        key={member.personId}
                        to="/people/$personId"
                        params={{ personId: member.personId }}
                        className="group min-w-0 overflow-hidden rounded-md border border-card-border bg-card shadow-[0_10px_24px_rgb(0_0_0/0.18)] transition-colors hover:border-primary/60"
                    >
                        <CastPortrait member={member}/>
                        <div className="min-w-0 p-2">
                            <h3 className="line-clamp-2 text-sm font-semibold leading-tight group-hover:text-primary">
                                {member.name}
                            </h3>
                            {member.role ? (
                                <p className="mt-1 line-clamp-2 text-xs leading-tight text-muted-foreground">
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
