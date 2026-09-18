import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * shadcn's Card, resting on the room's own glass rather than a flat surface.
 *
 * `@container/card` lets a card's own content reflow by the card's width, not
 * the viewport's — useful once a card sits in a grid on a wide screen, which
 * `Today`'s activity cards now do.
 *
 * `variant: "edge"` is the gradient-ring treatment (`.glass-edge`) reserved
 * for the one card that arrives unasked — a pending nudge — kept as a cva
 * variant rather than a class sprinkled at the call site, so any future card
 * that wants to read as "arrived" reaches for the same name.
 */
const cardVariants = cva('@container/card flex flex-col gap-4 p-5 text-foreground', {
    variants: {
        variant: {
            default: 'glass',
            edge: 'glass glass-edge',
        },
    },
    defaultVariants: { variant: 'default' },
});

function Card({
    className,
    variant,
    ...props
}: ComponentProps<'div'> & VariantProps<typeof cardVariants>) {
    return (
        <div data-slot="card" className={cn(cardVariants({ variant, className }))} {...props} />
    );
}

function CardHeader({ className, ...props }: ComponentProps<'div'>) {
    return (
        <div
            data-slot="card-header"
            className={cn(
                'grid auto-rows-min grid-rows-[auto_auto] items-start gap-1 has-[[data-slot=card-action]]:grid-cols-[1fr_auto]',
                className
            )}
            {...props}
        />
    );
}

function CardTitle({ className, ...props }: ComponentProps<'h2'>) {
    return (
        <h2
            data-slot="card-title"
            className={cn('font-display text-sm font-semibold text-dust', className)}
            {...props}
        />
    );
}

function CardDescription({ className, ...props }: ComponentProps<'p'>) {
    return <p data-slot="card-description" className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

function CardAction({ className, ...props }: ComponentProps<'div'>) {
    return (
        <div
            data-slot="card-action"
            className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
            {...props}
        />
    );
}

function CardContent({ className, ...props }: ComponentProps<'div'>) {
    return <div data-slot="card-content" className={cn('text-sm', className)} {...props} />;
}

function CardFooter({ className, ...props }: ComponentProps<'div'>) {
    return <div data-slot="card-footer" className={cn('flex items-center gap-2', className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter, cardVariants };
