import { useState } from 'react';
import { Trash2 } from 'lucide-react';

import { useAddReason, useRemoveReason, useReasons } from '../../hooks/useLove';
import { useAuthStore } from '../../stores/authStore';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/ErrorState';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { formatDayLabel } from '../../utils/time';
import { cn } from '../../lib/utils';

const MAX_LENGTH = 200;

/**
 * A jar of short "why I love you" notes.
 *
 * Either of them can drop one in, or take their own back out — never the
 * other's. Newest sits on top, the same way the rest of the chamber reads.
 * One of these is surfaced on Today as the reason of the day, so adding or
 * removing one here is also handled there (see useLove.ts).
 */
export function Reasons() {
    const { data, isLoading, isError, refetch } = useReasons();
    const add = useAddReason();
    const remove = useRemoveReason();
    const me = useAuthStore((s) => s.username);
    const [text, setText] = useState('');

    if (isLoading) {
        return (
            <div className="space-y-3 p-4">
                <Skeleton className="h-32 w-full rounded-[20px]" />
                <Skeleton className="h-20 w-full rounded-[20px]" />
                <Skeleton className="h-20 w-full rounded-[20px]" />
            </div>
        );
    }

    if (isError) return <ErrorState title="Couldn't load the jar." onRetry={() => refetch()} />;

    const reasons = data ?? [];
    const length = text.length;
    const over = length > MAX_LENGTH;
    const canSubmit = text.trim().length > 0 && !over && !add.isPending;

    function submit() {
        const trimmed = text.trim();
        if (!trimmed || trimmed.length > MAX_LENGTH || add.isPending) return;
        add.mutate(trimmed, { onSuccess: () => setText('') });
    }

    return (
        <div className="chamber-scroll mx-auto min-h-0 w-full max-w-2xl flex-1 overflow-y-auto px-4 pb-24">
            <div className="flex items-baseline justify-between pt-4 pb-4">
                <h2 className="love-text font-display text-[1.65rem] leading-tight font-bold">Reasons</h2>
                {reasons.length > 0 && (
                    <Badge variant="soft">
                        {reasons.length} {reasons.length === 1 ? 'reason' : 'reasons'} in the jar
                    </Badge>
                )}
            </div>

            <Card className="mb-5">
                <div>
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
                        }}
                        placeholder="Why you love them, in a sentence"
                        rows={3}
                        aria-label="A reason"
                        className="field w-full resize-none rounded-xl px-4 py-3 text-sm"
                    />
                    <div className="mt-2 flex items-center justify-between gap-3">
                        <span className={cn('text-xs', over ? 'font-semibold text-rose' : 'text-dust')}>
                            {length} / {MAX_LENGTH}
                        </span>
                        <Button type="button" onClick={submit} disabled={!canSubmit}>
                            {add.isPending ? 'Dropping it in…' : 'Drop it in'}
                        </Button>
                    </div>
                    {add.isError && (
                        <p role="alert" className="mt-2 text-sm text-rose">
                            {add.error instanceof Error ? add.error.message : 'That did not save.'}
                        </p>
                    )}
                </div>
            </Card>

            {reasons.length === 0 ? (
                <p className="px-2 py-10 text-center text-sm text-dust">
                    The jar is empty. Write the first reason — it&apos;ll be waiting here whenever either
                    of you needs it.
                </p>
            ) : (
                <ul className="space-y-3 pb-2">
                    {reasons.map((reason) => (
                        <li key={reason._id}>
                            <Card>
                                <div>
                                    <div className="flex items-start justify-between gap-3">
                                        <p className="min-w-0 flex-1 text-[0.98rem] leading-relaxed text-chalk/90">
                                            &ldquo;{reason.text}&rdquo;
                                        </p>
                                        {reason.author === me && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                aria-label="Delete this reason"
                                                onClick={() => remove.mutate(reason._id)}
                                                disabled={remove.isPending}
                                                className="shrink-0 text-dust hover:text-rose"
                                            >
                                                <Trash2 size={15} aria-hidden="true" />
                                            </Button>
                                        )}
                                    </div>
                                    <div className="mt-2 flex items-center gap-2">
                                        <Badge variant="outline">{reason.author}</Badge>
                                        <span className="text-xs text-dust">{formatDayLabel(reason.createdAt)}</span>
                                    </div>
                                </div>
                            </Card>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
