import type { CSSProperties, ComponentProps } from 'react';
import { Toaster as Sonner } from 'sonner';

/**
 * Toasts, in the chamber's palette.
 *
 * Mount this inside .chamber-root. Sonner ships an unlayered stylesheet, which
 * outranks every layered Tailwind utility, so the colours are set through
 * Sonner's own CSS variables rather than through class names.
 */
export function Toaster(props: ComponentProps<typeof Sonner>) {
    return (
        <Sonner
            theme="dark"
            position="top-center"
            style={
                {
                    fontFamily: 'var(--font-ui)',
                    '--normal-bg': 'var(--popover)',
                    '--normal-text': 'var(--popover-foreground)',
                    '--normal-border': 'var(--border)',
                    '--border-radius': '1rem',
                } as CSSProperties
            }
            {...props}
        />
    );
}
