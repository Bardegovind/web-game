import { useCallback, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

import { HeartGlyph } from './LoveBackdrop';

interface Burst {
    id: number;
    x: number;
    y: number;
}

const listeners = new Set<(burst: Burst) => void>();
let nextId = 1;

/**
 * A few small hearts rising from an element: after a message is sent, or a
 * heart is given to one.
 *
 * Decoration only. It is called after the real work has already happened,
 * returns at once, and does nothing with reduced motion or with no layer
 * mounted.
 */
export function burstHearts(from: Element | null) {
    if (!from || listeners.size === 0) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const rect = from.getBoundingClientRect();
    const burst = { id: nextId++, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    listeners.forEach((listener) => listener(burst));
}

/** Where each heart of a burst goes. Fixed, so every burst is the same gentle shape. */
const PARTICLES: ReadonlyArray<{ dx: number; dy: number; size: number; delay: number; rotate: number; tone: string }> = [
    { dx: -34, dy: -44, size: 10, delay: 0, rotate: -18, tone: 'text-heart' },
    { dx: -16, dy: -66, size: 13, delay: 0.03, rotate: -6, tone: 'text-lamp' },
    { dx: 3, dy: -78, size: 11, delay: 0.06, rotate: 4, tone: 'text-heart' },
    { dx: 21, dy: -60, size: 14, delay: 0.02, rotate: 12, tone: 'text-rose' },
    { dx: 37, dy: -40, size: 9, delay: 0.05, rotate: 22, tone: 'text-lamp' },
    { dx: -3, dy: -36, size: 8, delay: 0.08, rotate: -10, tone: 'text-violet' },
];

const DURATION = 0.7;

function HeartBurst({ id, x, y, onDone }: Burst & { onDone: (id: number) => void }) {
    useEffect(() => {
        const timer = window.setTimeout(() => onDone(id), (DURATION + 0.15) * 1000);
        return () => window.clearTimeout(timer);
    }, [id, onDone]);

    return (
        <span className="absolute" style={{ left: x, top: y }}>
            {PARTICLES.map((particle, i) => (
                <motion.span
                    key={i}
                    className={`absolute ${particle.tone}`}
                    style={{ left: -particle.size / 2, top: -particle.size / 2 }}
                    initial={{ x: 0, y: 0, scale: 0.4, opacity: 0, rotate: 0 }}
                    animate={{
                        x: particle.dx,
                        y: particle.dy,
                        scale: [0.4, 1.1, 0.9],
                        opacity: [0, 1, 0],
                        rotate: particle.rotate,
                    }}
                    transition={{ duration: DURATION, delay: particle.delay, ease: 'easeOut' }}
                >
                    <HeartGlyph size={particle.size} />
                </motion.span>
            ))}
        </span>
    );
}

/**
 * Where bursts are drawn: one fixed layer at the chamber's root, above the
 * screens and never taking a pointer, so a burst cannot widen a scrolling
 * list or sit in the way of a tap. Each burst unmounts when it has finished.
 */
export function HeartBurstLayer() {
    const reduceMotion = useReducedMotion();
    const [bursts, setBursts] = useState<Burst[]>([]);

    const remove = useCallback((id: number) => {
        setBursts((list) => list.filter((burst) => burst.id !== id));
    }, []);

    useEffect(() => {
        if (reduceMotion) return;
        const listener = (burst: Burst) => setBursts((list) => [...list.slice(-4), burst]);
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    }, [reduceMotion]);

    if (reduceMotion || bursts.length === 0) return null;

    return (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[55] overflow-hidden">
            {bursts.map((burst) => (
                <HeartBurst key={burst.id} {...burst} onDone={remove} />
            ))}
        </div>
    );
}
