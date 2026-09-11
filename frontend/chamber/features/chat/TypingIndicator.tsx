import { motion } from 'framer-motion';

/** Three dots, breathing. The server stops this on its own after ~3s. */
export function TypingIndicator({ name }: { name: string }) {
    return (
        <div className="flex items-center gap-2 px-1 py-1 text-xs text-dust">
            <span className="flex gap-1" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                    <motion.span
                        key={i}
                        className="h-1.5 w-1.5 rounded-full bg-dust"
                        animate={{ opacity: [0.25, 1, 0.25] }}
                        transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
                    />
                ))}
            </span>
            {name} is typing
        </div>
    );
}
