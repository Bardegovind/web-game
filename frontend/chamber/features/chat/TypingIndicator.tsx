import { motion, useReducedMotion } from 'framer-motion';

/**
 * A received-style bubble with three bouncing dots — the bubble is the
 * signal, the way WhatsApp and Instagram show it. No visible "is typing"
 * text sits beside it; that lives only in the header and the conversation
 * list. The server stops this on its own after a few seconds of silence.
 */
export function TypingIndicator({ name }: { name: string }) {
    const reduceMotion = useReducedMotion();

    return (
        <div data-typing-indicator="" role="status" aria-live="polite" className="flex w-full justify-start">
            <span className="sr-only">{name} is typing…</span>
            <div className="flex items-center gap-1.5 rounded-[var(--radius-bubble)] rounded-bl-sm bg-velvet-lifted px-4 py-4">
                {[0, 1, 2].map((i) => (
                    <motion.span
                        key={i}
                        aria-hidden="true"
                        className="h-2 w-2 rounded-full bg-chalk/70"
                        animate={
                            reduceMotion
                                ? { opacity: [0.4, 1, 0.4] }
                                : { y: [0, -4, 0], opacity: [0.5, 1, 0.5] }
                        }
                        transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15 }}
                    />
                ))}
            </div>
        </div>
    );
}
