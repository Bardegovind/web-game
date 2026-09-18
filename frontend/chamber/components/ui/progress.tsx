import { useId, type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';

import { cn } from '@/lib/utils';

/**
 * A circular progress ring, hand-rolled rather than pulled in from
 * `@radix-ui/react-progress`: the countdown to the next anniversary is round,
 * and a linear bar would need to be reinvented as one anyway. No new
 * dependency, and the shape fits the use.
 */
export function ProgressRing({
    value,
    size = 64,
    strokeWidth = 6,
    className,
    children,
}: {
    /** 0–100. */
    value: number;
    size?: number;
    strokeWidth?: number;
    className?: string;
    children?: ReactNode;
}) {
    const gradientId = useId();
    const reduceMotion = useReducedMotion();

    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const clamped = Math.min(100, Math.max(0, value));
    const offset = circumference * (1 - clamped / 100);

    return (
        <div
            role="progressbar"
            aria-valuenow={Math.round(clamped)}
            aria-valuemin={0}
            aria-valuemax={100}
            className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
            style={{ width: size, height: size }}
        >
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="var(--color-hairline)"
                    strokeWidth={strokeWidth}
                />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={`url(#${gradientId})`}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    style={reduceMotion ? undefined : { transition: 'stroke-dashoffset 0.6s ease' }}
                />
                <defs>
                    <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="var(--color-lamp)" />
                        <stop offset="100%" stopColor="var(--color-violet)" />
                    </linearGradient>
                </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">{children}</div>
        </div>
    );
}
