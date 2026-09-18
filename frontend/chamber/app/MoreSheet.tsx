import { BookHeart, HeartHandshake, ListChecks, type LucideIcon } from 'lucide-react';

import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { MORE_SCREENS, type Screen } from './navigation';

const ICONS: Partial<Record<Screen, LucideIcon>> = {
    story: BookHeart,
    list: ListChecks,
    reasons: HeartHandshake,
};

export function MoreSheet({
    open,
    onOpenChange,
    container,
    onSelect,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    container: HTMLElement | null;
    onSelect: (screen: Screen) => void;
}) {
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent container={container}>
                <SheetTitle>More</SheetTitle>
                <SheetDescription className="sr-only">Other places in the chamber</SheetDescription>

                <ul className="mt-3 flex flex-col gap-2">
                    {MORE_SCREENS.map(({ id, label }) => {
                        const Icon = ICONS[id];

                        return (
                            <li key={id}>
                                <button
                                    type="button"
                                    aria-label={label}
                                    onClick={() => {
                                        onSelect(id);
                                        onOpenChange(false);
                                    }}
                                    className="glass glass-hover flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left text-foreground"
                                >
                                    {Icon && (
                                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-lamp/10 text-lamp">
                                            <Icon size={18} aria-hidden="true" />
                                        </span>
                                    )}
                                    <span className="font-display text-[1.05rem] font-semibold">{label}</span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </SheetContent>
        </Sheet>
    );
}
