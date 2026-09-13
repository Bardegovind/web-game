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
                    className="glass-solid flex items-center justify-center gap-2 border-x-0 border-t-0 px-4 py-2 text-xs text-dust shadow-[0_8px_28px_rgba(255,60,131,0.1)]"
                >
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-lamp" />
                    Reconnecting. Your messages are safe.
                </motion.div>
            )}
        </AnimatePresence>
    );
}
