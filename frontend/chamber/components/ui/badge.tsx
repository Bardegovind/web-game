import type { ComponentProps } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
    'inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
    {
        variants: {
            variant: {
                default: 'love-badge border-transparent',
                soft: 'border-transparent bg-lamp/10 text-lamp',
                outline: 'border-hairline text-chalk',
            },
        },
        defaultVariants: { variant: 'default' },
    }
);

function Badge({
    className,
    variant,
    asChild = false,
    ...props
}: ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
    const Comp = asChild ? Slot : 'span';

    return <Comp data-slot="badge" className={cn(badgeVariants({ variant, className }))} {...props} />;
}

export { Badge, badgeVariants };
