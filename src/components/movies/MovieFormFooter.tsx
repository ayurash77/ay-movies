import { Button } from '@/components/ui/button';

type MovieFormFooterProps = {
    formId: string;
    submitLabel: string;
    isSubmitting: boolean;
    disabled?: boolean;
    onCancel: () => void;
};

export function MovieFormFooter({
    formId,
    submitLabel,
    isSubmitting,
    disabled = false,
    onCancel,
}: MovieFormFooterProps) {
    return (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/70 bg-background/80 px-4 py-3 shadow-[0_-16px_36px_rgb(0_0_0/0.28)] backdrop-blur-md [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))] md:left-60">
            <div className="mx-auto flex w-full max-w-3xl items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={onCancel}>
                    Отмена
                </Button>
                <Button type="submit" form={formId} disabled={isSubmitting || disabled}>
                    {isSubmitting ? 'Сохранение…' : submitLabel}
                </Button>
            </div>
        </div>
    );
}
