import { useState } from 'react';
import { motion } from 'framer-motion';

import { useAnswerQuestion, useQuestion, useToday } from '../../hooks/useChamber';
import { useAuthStore } from '../../stores/authStore';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/ErrorState';
import { formatDayLabel } from '../../utils/time';

/**
 * What is waiting.
 *
 * The first thing she sees on entering, so it opens with something rather than
 * a blank grid — and it is the reason to come back tomorrow.
 */
export function Today({ onOpenImage }: { onOpenImage: (url: string) => void }) {
    const me = useAuthStore((s) => s.username);
    const { data, isLoading, isError, refetch } = useToday();
    const { data: question } = useQuestion();
    const answer = useAnswerQuestion();
    const [draft, setDraft] = useState('');

    if (isLoading) {
        return (
            <div className="space-y-4 p-4">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-40 w-full" />
            </div>
        );
    }

    if (isError) return <ErrorState title="Couldn't load today." onRetry={() => refetch()} />;
    if (!data) return null;

    const waiting = [
        data.unreadMessages > 0 && `${data.unreadMessages} new message${data.unreadMessages === 1 ? '' : 's'}`,
        data.unopenedLetters > 0 && `${data.unopenedLetters} letter${data.unopenedLetters === 1 ? '' : 's'} unopened`,
        !data.question.answered && 'a question waiting',
    ].filter(Boolean) as string[];

    const myAnswer = question?.answers.find((a) => a.username === me);
    const theirAnswer = question?.answers.find((a) => a.username !== me);

    return (
        <div className="chamber-scroll mx-auto min-h-0 w-full max-w-2xl flex-1 overflow-y-auto px-4 pb-24">
            <section className="py-6">
                {waiting.length > 0 ? (
                    <>
                        <p className="font-display text-xl leading-snug text-chalk">
                            Something is waiting for you.
                        </p>
                        <ul className="mt-3 space-y-1">
                            {waiting.map((line) => (
                                <li key={line} className="flex items-center gap-2 text-sm text-dust">
                                    <span aria-hidden="true" className="h-1 w-1 rounded-full bg-lamp" />
                                    {line}
                                </li>
                            ))}
                        </ul>
                    </>
                ) : (
                    <p className="font-display text-xl leading-snug text-chalk">
                        You are all caught up.
                    </p>
                )}
            </section>

            {question && (
                <section className="mb-6 rounded-3xl border border-hairline bg-velvet/60 p-5">
                    <p className="font-display text-xs text-dust italic">Today&apos;s question</p>
                    <p className="mt-2 font-display text-[1.15rem] leading-snug text-chalk">
                        {question.text}
                    </p>

                    {myAnswer ? (
                        <div className="mt-4 space-y-3">
                            <div>
                                <p className="text-[0.68rem] text-dust">You said</p>
                                <p className="mt-0.5 text-sm text-chalk">{myAnswer.text}</p>
                            </div>
                            <div>
                                <p className="text-[0.68rem] text-dust">
                                    {theirAnswer ? `${theirAnswer.username} said` : 'Still waiting on them'}
                                </p>
                                {theirAnswer && (
                                    <p className="mt-0.5 text-sm text-lamp">{theirAnswer.text}</p>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="mt-4 flex gap-2">
                            <input
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && draft.trim()) answer.mutate(draft.trim());
                                }}
                                placeholder="Your answer"
                                className="flex-1 rounded-2xl border border-hairline bg-ink px-4 py-2.5 text-sm text-chalk placeholder:text-dust/70 focus:border-lamp-dim focus:outline-none"
                            />
                            <button
                                type="button"
                                onClick={() => draft.trim() && answer.mutate(draft.trim())}
                                disabled={!draft.trim() || answer.isPending}
                                className="rounded-2xl bg-lamp px-4 py-2 text-sm text-ink transition-opacity disabled:opacity-30"
                            >
                                Answer
                            </button>
                        </div>
                    )}
                </section>
            )}

            {data.memoryOfTheDay && (
                <motion.section
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="mb-6"
                >
                    <p className="mb-2 font-display text-xs text-dust italic">
                        From {formatDayLabel(data.memoryOfTheDay.createdAt)}
                    </p>
                    <button
                        type="button"
                        onClick={() => onOpenImage(data.memoryOfTheDay!.url)}
                        className="block w-full overflow-hidden rounded-2xl"
                    >
                        <img
                            src={data.memoryOfTheDay.url}
                            alt={data.memoryOfTheDay.caption || ''}
                            loading="lazy"
                            className="max-h-80 w-full object-cover"
                        />
                    </button>
                    <p className="mt-2 text-sm text-dust">
                        {data.memoryOfTheDay.caption || 'Remember this?'}
                    </p>
                </motion.section>
            )}
        </div>
    );
}
