import { AnimatePresence, motion } from 'framer-motion';
import { usePresenceStore } from '../stores/presenceStore';

/**
 * Shown only while the socket is away.
 *
 * A dropped connection reconnects on its own, so this reassures rather than
 * asks her to do anything — and it never suggests refreshing the page.
 */
export function ConnectionBanner() {
    const connection = usePresenceStore((s) => s.connection);
    const hidden = connection === 'online' || connection === 'connecting';

    return (
        <AnimatePresence>
            {!hidden && (
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25 }}
                    role="status"
                    className="flex items-center justify-center gap-2 bg-velvet-lifted/90 px-4 py-2 text-xs text-dust backdrop-blur"
                >
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-lamp-dim" />
                    Reconnecting. Your messages are safe.
                </motion.div>
            )}
        </AnimatePresence>
    );
}
