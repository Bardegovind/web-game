import { BookHeart, ListChecks, type LucideIcon } from 'lucide-react';

import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { MORE_SCREENS, type Screen } from './navigation';

const ICONS: Partial<Record<Screen, LucideIcon>> = {
    story: BookHeart,
    list: ListChecks,
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

                <ul className="mt-2 flex flex-col gap-1">
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
                                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-3.5 text-left text-foreground transition-colors hover:bg-muted"
                                >
                                    {Icon && <Icon size={20} className="text-primary" aria-hidden="true" />}
                                    <span className="font-display text-[1.05rem]">{label}</span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </SheetContent>
        </Sheet>
    );
}
