import { motion, useReducedMotion } from 'framer-motion';

import { HeartGlyph } from './LoveBackdrop';

/**
 * The one moment that is allowed to be theatrical.
 *
 * Replacing the game with the chamber instantly makes arriving feel like a tab
 * switch. This is a single breath — a heart beating on a rose tile, the name
 * of the place, three small lights — and then it is gone. It plays once per
 * entry, for exactly as long as before, and never repeats.
 */
export function Entrance({ onDone }: { onDone: () => void }) {
    const reduceMotion = useReducedMotion();

    return (
        <motion.div
            className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5 bg-ink"
            style={{
                backgroundImage: 'radial-gradient(55% 40% at 50% 46%, rgba(255, 60, 131, 0.14), transparent 70%)',
            }}
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.5, delay: 0.85 }}
            onAnimationComplete={onDone}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
                className="love-fill-bright flex size-16 items-center justify-center rounded-2xl shadow-[0_0_48px_rgba(255,60,131,0.45)]"
            >
                <motion.span
                    className="flex text-white"
                    animate={reduceMotion ? undefined : { scale: [1, 1.18, 1, 1.12, 1] }}
                    transition={{ duration: 1, ease: 'easeInOut', delay: 0.2 }}
                >
                    <HeartGlyph size={28} />
                </motion.span>
            </motion.div>

            <motion.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.1, ease: 'easeOut' }}
                className="love-text font-display text-2xl leading-none font-extrabold"
            >
                ours
            </motion.p>

            <div className="flex gap-1.5" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                    <motion.span
                        key={i}
                        className="size-1.5 rounded-full bg-lamp"
                        animate={
                            reduceMotion ? { opacity: 0.7 } : { opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }
                        }
                        transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                    />
                ))}
            </div>
        </motion.div>
    );
}
