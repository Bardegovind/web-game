import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Mail, MailOpen, X } from 'lucide-react';

import { useLetters, useOpenLetter } from '../../hooks/useChamber';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/ErrorState';
import { formatDayLabel } from '../../utils/time';
import type { Letter } from '../../types';
import { HeartGlyph } from '../../app/LoveBackdrop';

/**
 * "Open when..." letters.
 *
 * An unopened letter shows only its prompt — the server withholds the rest, so
 * there is nothing to peek at even in the network tab. Opening one is a small
 * deliberate act, and the moment is recorded.
 */
export function Letters() {
    const { data, isLoading, isError, refetch } = useLetters();
    const open = useOpenLetter();
    const [reading, setReading] = useState<Letter | null>(null);

    if (isLoading) {
        return (
            <div className="space-y-3 p-4">
                <Skeleton className="h-[4.5rem] w-full rounded-[20px]" />
                <Skeleton className="h-[4.5rem] w-full rounded-[20px]" />
            </div>
        );
    }

    if (isError) return <ErrorState title="Couldn't load your letters." onRetry={() => refetch()} />;

    const letters = data?.letters ?? [];

    async function read(letter: Letter) {
        if (letter.isOpened) {
            setReading(letter);
            return;
        }
        const opened = await open.mutateAsync(letter._id);
        setReading(opened);
    }

    return (
        <div className="chamber-scroll mx-auto min-h-0 w-full max-w-2xl flex-1 overflow-y-auto px-4 pb-24">
            {letters.length === 0 ? (
                <div className="px-6 py-16 text-center">
                    <p className="font-display text-lg font-semibold text-chalk">No letters yet</p>
                    <p className="mt-1 text-sm text-dust">
                        Ones written for you will wait here until you need them.
                    </p>
                </div>
            ) : (
                <ul className="space-y-3 py-4">
                    {letters.map((letter) => (
                        <li key={letter._id}>
                            <motion.button
                                type="button"
                                whileTap={{ scale: 0.99 }}
                                onClick={() => read(letter)}
                                className={`glass glass-hover flex w-full items-center gap-4 px-4 py-4 text-left ${
                                    letter.isOpened ? 'text-dust' : 'border-lamp/30 bg-lamp/[0.06] text-chalk'
                                }`}
                            >
                                <span
                                    className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
                                        letter.isOpened
                                            ? 'bg-white/[0.05] text-dust'
                                            : 'love-fill shadow-[0_4px_16px_rgba(255,60,131,0.3)]'
                                    }`}
                                >
                                    {letter.isOpened ? <MailOpen size={18} /> : <Mail size={18} />}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block font-display text-[1.05rem] font-semibold">{letter.prompt}</span>
                                    <span className="mt-0.5 block text-xs text-dust">
                                        {letter.isOpened
                                            ? `Opened ${formatDayLabel(letter.openedAt)}`
                                            : 'Not opened yet'}
                                    </span>
                                </span>
                            </motion.button>
                        </li>
                    ))}
                </ul>
            )}

            <AnimatePresence>
                {reading && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        role="dialog"
                        aria-modal="true"
                        className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(10,6,16,0.9)] p-5 backdrop-blur-md"
                        onClick={() => setReading(null)}
                    >
                        <motion.article
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3 }}
                            onClick={(e) => e.stopPropagation()}
                            className="glass-solid relative max-h-[80vh] w-full max-w-md overflow-y-auto rounded-3xl p-7"
                        >
                            <button
                                type="button"
                                onClick={() => setReading(null)}
                                aria-label="Close"
                                className="absolute top-4 right-4 rounded-full p-1 text-dust transition-colors hover:text-chalk"
                            >
                                <X size={18} />
                            </button>

                            <p className="love-text pr-6 font-display text-lg leading-snug font-bold">{reading.prompt}</p>
                            <span className="my-4 flex items-center gap-2" aria-hidden="true">
                                <span className="love-fill-bright h-px w-10" />
                                <HeartGlyph size={9} className="text-heart" />
                            </span>
                            <p className="text-[0.98rem] leading-relaxed whitespace-pre-wrap text-chalk">
                                {reading.body}
                            </p>
                        </motion.article>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
