import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useReducedMotion } from 'framer-motion';

/** A heart, drawn once and filled with the current colour. */
export function HeartGlyph({ size, className }: { size: number; className?: string }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            focusable="false"
            className={className}
        >
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
    );
}

/**
 * Where each drifting heart starts and how it travels. Fixed, not random, so
 * the room looks the same every visit and nothing is recomputed on a render.
 * Negative delays put them mid-flight from the first frame.
 */
const HEARTS: ReadonlyArray<{
    left: string;
    size: number;
    opacity: number;
    duration: number;
    delay: number;
    sway: number;
    tilt: number;
    tone: 'heart' | 'lamp';
}> = [
    { left: '6%', size: 12, opacity: 0.16, duration: 22, delay: -4, sway: 14, tilt: -12, tone: 'heart' },
    { left: '17%', size: 9, opacity: 0.12, duration: 17, delay: -11, sway: -10, tilt: 8, tone: 'lamp' },
    { left: '29%', size: 16, opacity: 0.1, duration: 26, delay: -19, sway: 18, tilt: -6, tone: 'lamp' },
    { left: '41%', size: 10, opacity: 0.18, duration: 19, delay: -2, sway: -16, tilt: 14, tone: 'heart' },
    { left: '53%', size: 14, opacity: 0.09, duration: 24, delay: -14, sway: 12, tilt: -10, tone: 'heart' },
    { left: '64%', size: 8, opacity: 0.2, duration: 15, delay: -7, sway: -8, tilt: 10, tone: 'lamp' },
    { left: '75%', size: 18, opacity: 0.08, duration: 25, delay: -21, sway: 20, tilt: -14, tone: 'heart' },
    { left: '86%', size: 11, opacity: 0.14, duration: 20, delay: -9, sway: -14, tilt: 6, tone: 'lamp' },
    { left: '94%', size: 13, opacity: 0.12, duration: 18, delay: -15, sway: 10, tilt: -8, tone: 'heart' },
];

/**
 * The room itself: plum-black, three soft glows that breathe very slowly, a
 * faint grain, and a few small hearts rising behind everything.
 *
 * It sits under all content and never takes a pointer. Rendered only while
 * inside the chamber; the game page never has it. With reduced motion the
 * glows hold still and the hearts are not drawn at all.
 */
export const LoveBackdrop = memo(function LoveBackdrop() {
    const reduceMotion = useReducedMotion();

    return (
        <div className="love-backdrop" aria-hidden="true">
            <div
                className="love-glow"
                style={{
                    width: '110vmax',
                    height: '110vmax',
                    left: '-45vmax',
                    top: '-55vmax',
                    background: 'radial-gradient(closest-side, rgba(255, 107, 157, 0.10), transparent)',
                }}
            />
            <div
                className="love-glow"
                style={{
                    width: '120vmax',
                    height: '120vmax',
                    right: '-55vmax',
                    bottom: '-60vmax',
                    background: 'radial-gradient(closest-side, rgba(196, 77, 255, 0.08), transparent)',
                    animationDelay: '-6s',
                }}
            />
            <div
                className="love-glow"
                style={{
                    width: '80vmax',
                    height: '80vmax',
                    left: 'calc(50% - 40vmax)',
                    top: 'calc(50% - 40vmax)',
                    background: 'radial-gradient(closest-side, rgba(255, 60, 131, 0.05), transparent)',
                    animationDelay: '-3s',
                }}
            />

            <div className="love-noise" />

            {!reduceMotion &&
                HEARTS.map((heart, i) => (
                    <span
                        key={i}
                        className={`love-heart ${heart.tone === 'heart' ? 'text-heart' : 'text-lamp'}`}
                        style={
                            {
                                left: heart.left,
                                '--heart-opacity': heart.opacity,
                                '--heart-duration': `${heart.duration}s`,
                                '--heart-delay': `${heart.delay}s`,
                                '--heart-sway': `${heart.sway}px`,
                                '--heart-tilt': `${heart.tilt}deg`,
                            } as CSSProperties
                        }
                    >
                        <HeartGlyph size={heart.size} />
                    </span>
                ))}
        </div>
    );
});

/**
 * A soft rose light that follows the mouse, as on the portfolio.
 *
 * Only for a fine pointer (a mouse or trackpad) and never with reduced motion.
 * Pointer moves are folded into one write per animation frame, and the light
 * moves by transform alone.
 */
export function CursorGlow() {
    const reduceMotion = useReducedMotion();
    const ref = useRef<HTMLDivElement>(null);
    const [finePointer] = useState(
        () => typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches
    );
    const enabled = finePointer && !reduceMotion;

    useEffect(() => {
        const el = ref.current;
        if (!enabled || !el) return;

        let frame = 0;
        let x = 0;
        let y = 0;

        const onMove = (event: PointerEvent) => {
            if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
            x = event.clientX;
            y = event.clientY;
            if (frame) return;

            frame = window.requestAnimationFrame(() => {
                frame = 0;
                el.style.transform = `translate3d(${x - 200}px, ${y - 200}px, 0)`;
                el.style.opacity = '1';
            });
        };

        window.addEventListener('pointermove', onMove, { passive: true });
        return () => {
            window.removeEventListener('pointermove', onMove);
            if (frame) window.cancelAnimationFrame(frame);
        };
    }, [enabled]);

    if (!enabled) return null;
    return <div ref={ref} className="love-cursor-glow" aria-hidden="true" />;
}
