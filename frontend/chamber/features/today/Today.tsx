import { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

import { useAnswerQuestion, useQuestion, useToday } from '../../hooks/useChamber';
import { useMarkNudgesSeen, useSendNudge } from '../../hooks/useLove';
import { useAuthStore } from '../../stores/authStore';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/ErrorState';
import { formatDayLabel } from '../../utils/time';
import { HeartGlyph } from '../../app/LoveBackdrop';
import { UsCard } from './UsCard';

/**
 * What is waiting.
 *
 * The first thing she sees on entering, so it opens with something rather than
 * a blank grid — and it is the reason to come back tomorrow.
 */
export function Today({
    onOpenImage,
    sheetContainer,
}: {
    onOpenImage: (url: string) => void;
    sheetContainer: HTMLElement | null;
}) {
    const me = useAuthStore((s) => s.username);
    const { data, isLoading, isError, refetch } = useToday();
    const { data: question } = useQuestion();
    const answer = useAnswerQuestion();
    const [draft, setDraft] = useState('');
    const nudge = useSendNudge();
    const markSeen = useMarkNudgesSeen();
    const [nudgeHint, setNudgeHint] = useState<string | null>(null);

    if (isLoading) {
        return (
            <div className="space-y-4 p-4">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-44 w-full rounded-[20px]" />
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

    function handleNudge() {
        setNudgeHint(null);
        nudge.mutate(undefined, {
            onSuccess: (result) => {
                if (result.sent) {
                    toast('Sent, with a heart', {
                        icon: <HeartGlyph size={12} className="text-heart" />,
                    });
                } else {
                    setNudgeHint('Just sent one — give it a minute.');
                }
            },
            onError: (error) => {
                setNudgeHint(error instanceof Error ? error.message : "That didn't send.");
            },
        });
    }

    return (
        <div className="chamber-scroll mx-auto min-h-0 w-full max-w-2xl flex-1 overflow-y-auto px-4 pb-24">
            <div className="pt-4">
                <UsCard today={data} sheetContainer={sheetContainer} />

                <section className="glass mb-5 p-5">
                    <h2 className="font-display text-sm font-semibold text-dust">Reason of the day</h2>
                    {data.reasonOfTheDay ? (
                        <>
                            <p className="mt-2 text-[1.02rem] leading-relaxed text-chalk/90">
                                &ldquo;{data.reasonOfTheDay.text}&rdquo;
                            </p>
                            <p className="mt-2 text-xs text-dust">&mdash; {data.reasonOfTheDay.author}</p>
                        </>
                    ) : (
                        <p className="mt-2 text-sm text-dust">
                            The jar is empty. The first reason either of you drops in becomes the one shown
                            here.
                        </p>
                    )}
                </section>

                {data.pendingNudge && (
                    <motion.section
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        className="glass glass-edge mb-5 p-5"
                    >
                        <div className="flex items-center gap-3">
                            <HeartGlyph size={20} className="shrink-0 animate-heartbeat text-heart" />
                            <div className="min-w-0">
                                <p className="font-display text-base font-bold text-chalk">
                                    {data.pendingNudge.from} is thinking of you
                                </p>
                                <p className="mt-0.5 text-xs text-dust">
                                    {formatDayLabel(data.pendingNudge.createdAt)}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            aria-label="Mark nudge as seen"
                            onClick={() => markSeen.mutate()}
                            disabled={markSeen.isPending}
                            className="btn-soft mt-3 rounded-full px-4 py-2 text-sm disabled:opacity-60"
                        >
                            {markSeen.isPending ? 'Clearing…' : 'Seen'}
                        </button>
                    </motion.section>
                )}

                <section className="glass mb-5 flex items-center justify-between gap-4 p-5">
                    <div className="min-w-0">
                        <h2 className="font-display text-sm font-semibold text-dust">Thinking of you</h2>
                        <p className="mt-1 text-xs text-dust">{nudgeHint ?? 'One tap sends a heart, right now.'}</p>
                    </div>
                    <button
                        type="button"
                        aria-label="Send a nudge"
                        onClick={handleNudge}
                        disabled={nudge.isPending}
                        className="group/nudge btn-love inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm disabled:opacity-60"
                    >
                        <HeartGlyph
                            size={14}
                            className="transition-transform duration-300 group-hover/nudge:scale-125"
                        />
                        {nudge.isPending ? 'Sending…' : 'Send a heart'}
                    </button>
                </section>
            </div>

            <section className="pb-6">
                {waiting.length > 0 ? (
                    <>
                        <p className="love-text font-display text-[1.65rem] leading-tight font-bold">
                            Something is waiting for you.
                        </p>
                        <ul className="mt-3 space-y-1.5">
                            {waiting.map((line) => (
                                <li key={line} className="flex items-center gap-2 text-sm text-dust">
                                    <HeartGlyph size={10} className="shrink-0 text-lamp" />
                                    {line}
                                </li>
                            ))}
                        </ul>
                    </>
                ) : (
                    <p className="love-text font-display text-[1.65rem] leading-tight font-bold">
                        You are all caught up.
                    </p>
                )}
            </section>

            {question && (
                <section className="glass mb-5 p-5">
                    <h2 className="font-display text-base font-bold text-chalk">Today&apos;s question</h2>
                    <p className="mt-2 text-[1.02rem] leading-relaxed text-chalk/90">{question.text}</p>

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
                                className="field min-w-0 flex-1 rounded-xl px-4 py-2.5 text-sm"
                            />
                            <button
                                type="button"
                                onClick={() => draft.trim() && answer.mutate(draft.trim())}
                                disabled={!draft.trim() || answer.isPending}
                                className="btn-love rounded-xl px-5 py-2 text-sm disabled:opacity-40"
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
                    className="glass glass-hover mb-6 p-3"
                >
                    <p className="px-2 pt-1 pb-2.5 font-display text-sm font-semibold text-chalk">
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
                    <p className="px-2 pt-2.5 pb-1 text-sm text-dust">
                        {data.memoryOfTheDay.caption || 'Remember this?'}
                    </p>
                </motion.section>
            )}
        </div>
    );
}
