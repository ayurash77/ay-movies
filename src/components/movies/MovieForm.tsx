import { useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from 'react';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { GENRE_OPTIONS, type GenreOption } from '@/lib/genre-groups';
import type { MovieFormFields } from '@/lib/movie-data';
import { uploadPoster } from '@/server/uploads';

type MovieFormProps = {
    defaults?: Partial<MovieFormFields>;
    submitLabel: string;
    onSubmit: (fields: MovieFormFields) => Promise<void>;
};

type FieldRowProps = {
    htmlFor?: string;
    label: string;
    required?: boolean;
    align?: 'center' | 'start';
    children: ReactNode;
};

const KIND_LABELS: Record<NonNullable<MovieFormFields['kind']>, string> = {
    MOVIE: 'Фильм',
    SERIES: 'Сериал',
    CARTOON: 'Мультфильм',
};

function defaultSelectedGenres(genres: string[] | undefined) {
    const allowed = new Set<string>(GENRE_OPTIONS);
    return (genres?.filter((genre): genre is GenreOption => allowed.has(genre)) ?? []);
}

function FieldRow({ htmlFor, label, required, align = 'center', children }: FieldRowProps) {
    return (
        <div
            className={[
                'grid grid-cols-[minmax(5.5rem,36%)_minmax(0,1fr)] gap-3 sm:grid-cols-[9rem_minmax(0,1fr)]',
                align === 'start' ? 'items-start' : 'items-center',
            ].join(' ')}
        >
            <Label htmlFor={htmlFor} className={align === 'start' ? 'pt-2 leading-snug' : 'leading-snug'}>
                {label}{required ? ' *' : ''}
            </Label>
            <div className="min-w-0">{children}</div>
        </div>
    );
}

type UrlListFieldProps = {
    id: string;
    label: string;
    links: string[];
    setLinks: Dispatch<SetStateAction<string[]>>;
    addLabel: string;
};

function updateLink(setLinks: Dispatch<SetStateAction<string[]>>, index: number, value: string) {
    setLinks((current) => current.map((link, i) => (i === index ? value : link)));
}

function removeLink(setLinks: Dispatch<SetStateAction<string[]>>, index: number) {
    setLinks((current) => {
        const next = current.filter((_, i) => i !== index);
        return next.length ? next : [ '' ];
    });
}

function UrlListField({ id, label, links, setLinks, addLabel }: UrlListFieldProps) {
    return (
        <FieldRow htmlFor={id} label={label} align="start">
            <div className="flex flex-col gap-2">
                {links.map((link, index) => (
                    <div key={index} className="flex items-center gap-2">
                        <Input
                            id={index === 0 ? id : undefined}
                            value={link}
                            onChange={(event) => updateLink(setLinks, index, event.currentTarget.value)}
                            placeholder="https://..."
                        />
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label="Удалить ссылку"
                            onClick={() => removeLink(setLinks, index)}
                        >
                            <X/>
                        </Button>
                    </div>
                ))}
            </div>
            <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => setLinks((current) => [ ...current, '' ])}
            >
                <Plus/>
                {addLabel}
            </Button>
        </FieldRow>
    );
}

export function MovieForm({ defaults, submitLabel, onSubmit }: MovieFormProps) {
    const [ isSubmitting, setIsSubmitting ] = useState(false);
    const [ kind, setKind ] = useState<NonNullable<MovieFormFields['kind']>>(defaults?.kind ?? 'MOVIE');
    const [ trailerUrls, setTrailerUrls ] = useState<string[]>(
        defaults?.trailerUrls?.length ? defaults.trailerUrls : [ '' ],
    );
    const [ watchLinks, setWatchLinks ] = useState<string[]>(
        defaults?.watchLinks?.length ? defaults.watchLinks : [ '' ],
    );
    const [ selectedGenres, setSelectedGenres ] = useState<GenreOption[]>(() =>
        defaultSelectedGenres(defaults?.genres),
    );
    const posterPreviewUrl = defaults?.posterUrl?.trim();

    const toggleGenre = (genre: GenreOption) => {
        setSelectedGenres((current) =>
            current.includes(genre)
                ? current.filter((item) => item !== genre)
                : [ ...current, genre ],
        );
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);

        setIsSubmitting(true);
        try {
            let posterUrl = String(form.get('posterUrl') ?? '');
            const posterFile = form.get('posterFile');
            if (posterFile instanceof File && posterFile.size > 0) {
                const fd = new FormData();
                fd.append('file', posterFile);
                const uploaded = await uploadPoster({ data: fd });
                if (!uploaded.ok) {
                    toast.error(uploaded.error);
                    return;
                }
                posterUrl = uploaded.url;
            }

            await onSubmit({
                kind: String(form.get('kind') ?? 'MOVIE') as MovieFormFields['kind'],
                title: String(form.get('title') ?? ''),
                year: Number(form.get('year') ?? 0),
                country: String(form.get('country') ?? ''),
                description: String(form.get('description') ?? ''),
                posterUrl,
                trailerUrls: trailerUrls.map((link) => link.trim()).filter(Boolean),
                watchLinks: watchLinks.map((link) => link.trim()).filter(Boolean),
                director: String(form.get('director') ?? ''),
                genres: selectedGenres,
                starring: String(form.get('starring') ?? ''),
                durationMin: form.get('durationMin')
                    ? Number(form.get('durationMin'))
                    : '',
                seasonsCount: form.get('seasonsCount')
                    ? Number(form.get('seasonsCount'))
                    : '',
                episodesPerSeason: String(form.get('episodesPerSeason') ?? ''),
            });
        } catch {
            toast.error('Проверьте правильность заполнения полей');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <FieldRow htmlFor="kind" label="Тип" required>
                <select
                    id="kind"
                    name="kind"
                    required
                    value={kind}
                    onChange={(event) => setKind(event.currentTarget.value as NonNullable<MovieFormFields['kind']>)}
                    className="h-9 w-full rounded-md border border-input bg-field px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 sm:text-sm"
                >
                    {Object.entries(KIND_LABELS).map(([ value, label ]) => (
                        <option key={value} value={value}>{label}</option>
                    ))}
                </select>
            </FieldRow>

            <FieldRow htmlFor="title" label="Название" required>
                <Input id="title" name="title" required maxLength={200} defaultValue={defaults?.title ?? ''}/>
            </FieldRow>

            <FieldRow htmlFor="year" label="Год" required>
                <Input
                    id="year"
                    name="year"
                    type="number"
                    required
                    min={1888}
                    max={2100}
                    defaultValue={defaults?.year ?? new Date().getFullYear()}
                />
            </FieldRow>

            <FieldRow htmlFor="country" label="Страна" required>
                <Input id="country" name="country" required maxLength={100} defaultValue={defaults?.country ?? ''}/>
            </FieldRow>

            <FieldRow htmlFor="description" label="Описание" required align="start">
                <Textarea
                    id="description"
                    name="description"
                    required
                    rows={5}
                    maxLength={5000}
                    defaultValue={defaults?.description ?? ''}
                />
            </FieldRow>

            <FieldRow htmlFor="director" label="Режиссёр">
                <Input id="director" name="director" maxLength={200} defaultValue={defaults?.director ?? ''}/>
            </FieldRow>

            <FieldRow htmlFor="durationMin" label="Длительность">
                <Input
                    id="durationMin"
                    name="durationMin"
                    type="number"
                    min={1}
                    max={1000}
                    placeholder="мин"
                    defaultValue={defaults?.durationMin ?? ''}
                />
            </FieldRow>

            {kind === 'SERIES' ? (
                <>
                    <FieldRow htmlFor="seasonsCount" label="Сезонов">
                        <Input
                            id="seasonsCount"
                            name="seasonsCount"
                            type="number"
                            min={1}
                            max={100}
                            defaultValue={defaults?.seasonsCount ?? ''}
                        />
                    </FieldRow>
                    <FieldRow htmlFor="episodesPerSeason" label="Серии">
                        <Input
                            id="episodesPerSeason"
                            name="episodesPerSeason"
                            placeholder="8, 10, 12"
                            maxLength={500}
                            defaultValue={defaults?.episodesPerSeason ?? ''}
                        />
                    </FieldRow>
                </>
            ) : null}

            <FieldRow htmlFor="starring" label="В ролях">
                <Input
                    id="starring"
                    name="starring"
                    placeholder="Актёр один, Актриса два"
                    maxLength={500}
                    defaultValue={defaults?.starring ?? ''}
                />
            </FieldRow>

            <FieldRow label="Жанры" align="start">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {GENRE_OPTIONS.map((genre) => {
                        const checked = selectedGenres.includes(genre);
                        return (
                            <label
                                key={genre}
                                className={[
                                    'flex h-9 cursor-pointer items-center justify-center rounded-md border px-2 text-sm transition-colors',
                                    checked
                                        ? 'border-primary bg-primary text-primary-foreground'
                                        : 'border-border bg-field/50 text-muted-foreground hover:bg-field',
                                ].join(' ')}
                            >
                                <input
                                    type="checkbox"
                                    className="sr-only"
                                    checked={checked}
                                    onChange={() => toggleGenre(genre)}
                                />
                                {genre}
                            </label>
                        );
                    })}
                </div>
            </FieldRow>

            <FieldRow htmlFor="posterFile" label="Постер">
                <Input
                    id="posterFile"
                    name="posterFile"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="file:mr-2 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-0.5 file:text-xs file:text-secondary-foreground"
                />
            </FieldRow>

            <FieldRow htmlFor="posterUrl" label="Ссылка">
                <Input
                    id="posterUrl"
                    name="posterUrl"
                    placeholder="https://..."
                    defaultValue={defaults?.posterUrl ?? ''}
                />
            </FieldRow>

            <UrlListField
                id="trailerUrls"
                label="Ссылки на трейлеры"
                links={trailerUrls}
                setLinks={setTrailerUrls}
                addLabel="Добавить трейлер"
            />

            <UrlListField
                id="watchLinks"
                label="Где смотреть"
                links={watchLinks}
                setLinks={setWatchLinks}
                addLabel="Добавить ссылку"
            />

            {posterPreviewUrl ? (
                <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-2">
                    <img
                        src={posterPreviewUrl}
                        alt="Превью постера"
                        className="h-24 rounded object-cover"
                        onError={(e) => {
                            e.currentTarget.closest('div')!.style.display = 'none';
                        }}
                    />
                    <p className="text-xs text-muted-foreground">
                        Найденный постер — если не подходит, очистите ссылку или загрузите свой файл
                    </p>
                </div>
            ) : null}

            <Button type="submit" disabled={isSubmitting} className="self-end">
                {isSubmitting ? 'Сохранение…' : submitLabel}
            </Button>
        </form>
    );
}
