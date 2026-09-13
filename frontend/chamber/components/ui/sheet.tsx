import type { ComponentProps } from 'react';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * A bottom sheet built on Radix Dialog.
 *
 * Only the bottom side exists, because only the bottom side is used. Content
 * is portaled into `container`, which must be an element inside .chamber-root:
 * portaled to the body it would sit outside the chamber's theme and reset.
 */
export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;

export function SheetContent({
    className,
    children,
    container,
    ...props
}: ComponentProps<typeof SheetPrimitive.Content> & { container: HTMLElement | null }) {
    return (
        <SheetPrimitive.Portal container={container}>
            <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out" />
            <SheetPrimitive.Content
                className={cn(
                    'fixed inset-x-0 bottom-0 z-50 flex flex-col gap-2 rounded-t-3xl border-t border-border bg-popover px-4 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-popover-foreground shadow-2xl',
                    'data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=open]:duration-300',
                    'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=closed]:duration-200',
                    className
                )}
                {...props}
            >
                {children}
                <SheetPrimitive.Close
                    aria-label="Close menu"
                    className="absolute top-4 right-4 rounded-full p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                >
                    <X size={16} />
                </SheetPrimitive.Close>
            </SheetPrimitive.Content>
        </SheetPrimitive.Portal>
    );
}

export function SheetTitle({ className, ...props }: ComponentProps<typeof SheetPrimitive.Title>) {
    return <SheetPrimitive.Title className={cn('font-display text-lg text-foreground', className)} {...props} />;
}

export function SheetDescription({ className, ...props }: ComponentProps<typeof SheetPrimitive.Description>) {
    return <SheetPrimitive.Description className={cn('text-sm text-muted-foreground', className)} {...props} />;
}
