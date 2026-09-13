import type { CSSProperties, ComponentProps } from 'react';
import { Toaster as Sonner } from 'sonner';

/**
 * Toasts, in the chamber's palette: solid velvet glass with a soft rose glow.
 *
 * Mount this inside .chamber-root. Sonner ships an unlayered stylesheet, which
 * outranks every layered Tailwind utility, so the colours are set through
 * Sonner's own CSS variables, and the blur and glow through each toast's
 * inline style, rather than through class names.
 */
export function Toaster(props: ComponentProps<typeof Sonner>) {
    return (
        <Sonner
            theme="dark"
            position="top-center"
            style={
                {
                    fontFamily: 'var(--font-body)',
                    '--normal-bg': 'rgba(26, 15, 31, 0.92)',
                    '--normal-text': 'var(--color-chalk)',
                    '--normal-border': 'var(--color-hairline)',
                    '--border-radius': '1rem',
                } as CSSProperties
            }
            toastOptions={{
                style: {
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    boxShadow: '0 12px 36px rgba(0, 0, 0, 0.4), 0 0 32px rgba(255, 60, 131, 0.14)',
                },
            }}
            {...props}
        />
    );
}
