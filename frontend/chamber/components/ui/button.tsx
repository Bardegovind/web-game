import type { ComponentProps } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * shadcn's Button, wired to the room's own materials instead of shadcn's
 * defaults: `default` and `soft` reuse the `.btn-love` / `.btn-soft` classes
 * that already carry the gradient, the hover glow and the disabled state —
 * rewriting that in Tailwind utilities here would only risk drifting from
 * what the rest of the chamber already looks like.
 */
const buttonVariants = cva(
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium outline-none transition-[box-shadow,opacity] disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0',
    {
        variants: {
            variant: {
                default: 'btn-love',
                soft: 'btn-soft',
                ghost: 'text-chalk hover:bg-white/5',
                outline: 'border border-hairline text-chalk hover:border-lamp/40 hover:bg-white/5',
                destructive: 'bg-rose/15 text-rose hover:bg-rose/25',
            },
            size: {
                default: 'h-10 px-5',
                sm: 'h-8 px-4 text-[0.8rem]',
                lg: 'h-12 px-6 text-[0.95rem]',
                icon: 'size-9',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    }
);

function Button({
    className,
    variant,
    size,
    asChild = false,
    ...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
    const Comp = asChild ? Slot : 'button';

    return (
        <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
    );
}

export { Button, buttonVariants };
