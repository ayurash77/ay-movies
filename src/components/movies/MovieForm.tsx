import { useState, type Dispatch, type SetStateAction } from 'react';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { MovieFormFields } from '@/lib/movie-data';
import { uploadPoster } from '@/server/uploads';

type MovieFormProps = {
    defaults?: Partial<MovieFormFields>;
    submitLabel: string;
    onSubmit: (fields: MovieFormFields) => Promise<void>;
};

const KIND_LABELS: Record<NonNullable<MovieFormFields['kind']>, string> = {
    MOVIE: 'Фильм',
    SERIES: 'Сериал',
    CARTOON: 'Мультфильм',
};

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
        <div className="flex flex-col gap-2">
            <Label htmlFor={id}>{label}</Label>
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
        </div>
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
    const posterPreviewUrl = defaults?.posterUrl?.trim();

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
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
                genres: String(form.get('genres') ?? ''),
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
            <div className="flex flex-col gap-2">
                <Label htmlFor="kind">Тип *</Label>
                <select
                    id="kind"
                    name="kind"
                    required
                    value={kind}
                    onChange={(event) => setKind(event.currentTarget.value as NonNullable<MovieFormFields['kind']>)}
                    className="h-9 rounded-md border border-input bg-field px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 sm:text-sm"
                >
                    {Object.entries(KIND_LABELS).map(([ value, label ]) => (
                        <option key={value} value={value}>{label}</option>
                    ))}
                </select>
            </div>

            <div className="flex flex-col gap-2">
                <Label htmlFor="title">Название *</Label>
                <Input id="title" name="title" required maxLength={200} defaultValue={defaults?.title ?? ''}/>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-2">
                    <Label htmlFor="year">Год *</Label>
                    <Input
                        id="year"
                        name="year"
                        type="number"
                        required
                        min={1888}
                        max={2100}
                        defaultValue={defaults?.year ?? new Date().getFullYear()}
                    />
                </div>
                <div className="flex flex-col gap-2 sm:col-span-2">
                    <Label htmlFor="country">Страна *</Label>
                    <Input id="country" name="country" required maxLength={100} defaultValue={defaults?.country ?? ''}/>
                </div>
            </div>

            <div className="flex flex-col gap-2">
                <Label htmlFor="description">Описание *</Label>
                <Textarea
                    id="description"
                    name="description"
                    required
                    rows={5}
                    maxLength={5000}
                    defaultValue={defaults?.description ?? ''}
                />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                    <Label htmlFor="director">Режиссёр</Label>
                    <Input id="director" name="director" maxLength={200} defaultValue={defaults?.director ?? ''}/>
                </div>
                <div className="flex flex-col gap-2">
                    <Label htmlFor="durationMin">Длительность, мин</Label>
                    <Input
                        id="durationMin"
                        name="durationMin"
                        type="number"
                        min={1}
                        max={1000}
                        defaultValue={defaults?.durationMin ?? ''}
                    />
                </div>
            </div>

            {kind === 'SERIES' ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="seasonsCount">Сезонов</Label>
                        <Input
                            id="seasonsCount"
                            name="seasonsCount"
                            type="number"
                            min={1}
                            max={100}
                            defaultValue={defaults?.seasonsCount ?? ''}
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="episodesPerSeason">Серии по сезонам</Label>
                        <Input
                            id="episodesPerSeason"
                            name="episodesPerSeason"
                            placeholder="8, 10, 12"
                            maxLength={500}
                            defaultValue={defaults?.episodesPerSeason ?? ''}
                        />
                    </div>
                </div>
            ) : null}

            <div className="flex flex-col gap-2">
                <Label htmlFor="starring">В главных ролях (через запятую)</Label>
                <Input
                    id="starring"
                    name="starring"
                    placeholder="Актёр один, Актриса два"
                    maxLength={500}
                    defaultValue={defaults?.starring ?? ''}
                />
            </div>

            <div className="flex flex-col gap-2">
                <Label htmlFor="genres">Жанры (через запятую)</Label>
                <Input
                    id="genres"
                    name="genres"
                    placeholder="драма, триллер"
                    maxLength={300}
                    defaultValue={defaults?.genres ?? ''}
                />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                    <Label htmlFor="posterFile">Постер (JPEG/PNG/WebP, до 5 МБ)</Label>
                    <Input
                        id="posterFile"
                        name="posterFile"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="file:mr-2 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-0.5 file:text-xs file:text-secondary-foreground"
                    />
                </div>
                <div className="flex flex-col gap-2">
                    <Label htmlFor="posterUrl">…или ссылка на постер</Label>
                    <Input
                        id="posterUrl"
                        name="posterUrl"
                        placeholder="https://..."
                        defaultValue={defaults?.posterUrl ?? ''}
                    />
                </div>
            </div>

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
