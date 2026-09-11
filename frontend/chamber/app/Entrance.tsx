import { motion } from 'framer-motion';

/**
 * The one moment that is allowed to be theatrical.
 *
 * Replacing the game with the chamber instantly makes arriving feel like a tab
 * switch. This is a single breath — the room lighting — and then it is gone.
 * It plays once per entry and never repeats.
 */
export function Entrance({ onDone }: { onDone: () => void }) {
    return (
        <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-ink"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.5, delay: 0.85 }}
            onAnimationComplete={onDone}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.55, ease: 'easeOut' }}
                className="text-center"
            >
                <motion.span
                    aria-hidden="true"
                    className="mx-auto mb-4 block h-px w-16 origin-center bg-lamp"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
                />
                <p className="font-display text-2xl text-chalk italic">ours</p>
            </motion.div>
        </motion.div>
    );
}
