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
import { Card, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { UsCard } from './UsCard';

/**
 * What is waiting.
 *
 * The first thing she sees on entering, so it opens with something rather than
 * a blank grid — and it is the reason to come back tomorrow. The headline and
 * the waiting list read first; the three activities (Us, the reason of the
 * day, thinking of you) follow right after, prominent but not first — the
 * greeting still opens the page.
 *
 * The activities sit in a `@container` grid: on a phone they stack exactly as
 * before; once there is real room (a wide window, not just a wide viewport —
 * this could sit in a side panel one day too), they sit two up instead of
 * floating in a narrow column with empty margins either side.
 */
export function Today({
    onOpenImage,
    sheetContainer,
    onOpenReasons,
}: {
    onOpenImage: (url: string) => void;
    sheetContainer: HTMLElement | null;
    /** Takes her to the jar itself, from the one reason shown here. */
    onOpenReasons: () => void;
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
        <div className="chamber-scroll mx-auto min-h-0 w-full max-w-4xl flex-1 overflow-y-auto px-4 pb-24">
            <div className="mx-auto w-full max-w-2xl pt-4">
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
            </div>

            {/* A container query is resolved against an ancestor, never the queried element
                itself, so the name is established here on the wrapper and the grid utilities
                that read it live one level down, on its child — the same reason Card's own
                @container/card is only ever queried by its children. */}
            <div className="@container/activities pb-6">
                <div className="grid grid-cols-1 items-start gap-5 @3xl/activities:grid-cols-2">
                    <UsCard today={data} sheetContainer={sheetContainer} />

                    <Card>
                        <div>
                            <CardTitle>Reason of the day</CardTitle>
                            {data.reasonOfTheDay ? (
                                <>
                                    <p className="mt-2 text-[1.02rem] leading-relaxed text-chalk/90">
                                        &ldquo;{data.reasonOfTheDay.text}&rdquo;
                                    </p>
                                    <p className="mt-2 text-xs text-dust">&mdash; {data.reasonOfTheDay.author}</p>
                                </>
                            ) : (
                                <p className="mt-2 text-sm text-dust">
                                    The jar is empty. The first reason either of you drops in becomes the one
                                    shown here.
                                </p>
                            )}
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="mt-3 -ml-2"
                                onClick={onOpenReasons}
                            >
                                {data.reasonOfTheDay ? 'Open the jar' : 'Write the first one'}
                            </Button>
                        </div>
                    </Card>

                    {data.pendingNudge && (
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3 }}
                        >
                            <Card variant="edge">
                                <div>
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
                                    <Button
                                        type="button"
                                        variant="soft"
                                        size="sm"
                                        aria-label="Mark nudge as seen"
                                        onClick={() => markSeen.mutate(undefined, {
                                    onError: () => setNudgeHint('That would not clear just now. Try again in a moment.'),
                                })}
                                        disabled={markSeen.isPending}
                                        className="mt-3"
                                    >
                                        {markSeen.isPending ? 'Clearing…' : 'Seen'}
                                    </Button>
                                </div>
                            </Card>
                        </motion.div>
                    )}

                    <Card className="flex-row items-center justify-between gap-4">
                        <div className="min-w-0">
                            <CardTitle>Thinking of you</CardTitle>
                            <p className="mt-1 text-xs text-dust" role={nudgeHint ? 'alert' : undefined}>
                                {nudgeHint ?? 'One tap sends a heart, right now.'}
                            </p>
                        </div>
                        <Button
                            type="button"
                            variant="default"
                            aria-label="Send a nudge"
                            onClick={handleNudge}
                            disabled={nudge.isPending}
                            className="group/nudge shrink-0 gap-2"
                        >
                            <HeartGlyph
                                size={14}
                                className="transition-transform duration-300 group-hover/nudge:scale-125"
                            />
                            {nudge.isPending ? 'Sending…' : 'Send a heart'}
                        </Button>
                    </Card>
                </div>
            </div>

            <div className="mx-auto w-full max-w-2xl">
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
        </div>
    );
}
