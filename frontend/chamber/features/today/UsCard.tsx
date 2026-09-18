import { useState } from 'react';
import { Pencil } from 'lucide-react';

import { Sheet, SheetContent, SheetDescription, SheetTitle } from '../../components/ui/sheet';
import { ProgressRing } from '../../components/ui/progress';
import { Card, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { useSetUs, useUs } from '../../hooks/useLove';
import { formatTogether } from '../../utils/time';
import type { Today } from '../../types';

/** `<input type="date">` wants "yyyy-mm-dd" in local time, not an ISO instant. */
function toDateInputValue(value: string | Date): string {
    const date = value instanceof Date ? value : new Date(value);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * How long they have been together, and the days left until the next
 * anniversary — with a quiet way to correct the date it all counts from.
 *
 * `today.daysTogether` / `today.nextAnniversary` come already loaded with the
 * rest of Today, so the numbers show at once; the edit sheet reaches for the
 * raw `startDate` from `useUs()`, which Today's payload does not carry.
 */
export function UsCard({ today, sheetContainer }: { today: Today; sheetContainer: HTMLElement | null }) {
    const { data: us } = useUs();
    const setUs = useSetUs();
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState('');

    const daysAway = today.nextAnniversary.daysAway;
    // A whole year isn't known from `daysAway` alone, but a rough share of one
    // is enough for a ring that only has to feel like it's closing in.
    const percent = Math.min(100, Math.max(0, ((365 - daysAway) / 365) * 100));

    function openSheet() {
        setDraft(us ? toDateInputValue(us.startDate) : toDateInputValue(new Date()));
        setUs.reset();
        setOpen(true);
    }

    function handleSave() {
        if (!draft) return;
        setUs.mutate(draft, { onSuccess: () => setOpen(false) });
    }

    return (
        <>
            <Card className="has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-lamp/50">
                <div>
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <CardTitle>Us</CardTitle>
                            <p className="love-text mt-1 font-display text-xl leading-tight font-bold @[22rem]/card:text-2xl">
                                {us ? formatTogether(us.startDate) : '…'}
                            </p>
                            <p className="mt-0.5 text-xs text-dust">together</p>

                            <Button
                                type="button"
                                variant="soft"
                                size="sm"
                                aria-label="Edit when we started"
                                onClick={openSheet}
                                className="mt-3 gap-1.5"
                            >
                                <Pencil size={12} aria-hidden="true" />
                                Edit
                            </Button>
                        </div>

                        <ProgressRing value={percent} size={68} strokeWidth={5} className="shrink-0">
                            <span className="font-display text-[0.7rem] leading-none font-bold text-chalk">
                                {daysAway}
                            </span>
                            <span className="sr-only"> days to the next anniversary</span>
                        </ProgressRing>
                    </div>
                    <p className="mt-3 text-xs text-dust">
                        {daysAway === 0
                            ? 'Your anniversary is today.'
                            : `${daysAway} day${daysAway === 1 ? '' : 's'} to the next anniversary`}
                    </p>
                </div>
            </Card>

            <Sheet
                open={open}
                onOpenChange={(next) => {
                    if (setUs.isPending) return;
                    setOpen(next);
                }}
            >
                <SheetContent container={sheetContainer}>
                    <SheetTitle>When we started</SheetTitle>
                    <SheetDescription className="sr-only">
                        Set the day the two of you count from.
                    </SheetDescription>

                    <input
                        type="date"
                        aria-label="Start date"
                        value={draft}
                        max={toDateInputValue(new Date())}
                        onChange={(e) => setDraft(e.target.value)}
                        className="field mt-1 w-full rounded-xl px-3.5 py-2.5 text-sm"
                    />

                    {setUs.isError && (
                        <p role="alert" className="text-sm text-rose">
                            {setUs.error instanceof Error ? setUs.error.message : 'That did not save.'}
                        </p>
                    )}

                    <div className="mt-1 flex gap-2">
                        <Button
                            type="button"
                            variant="soft"
                            className="flex-1"
                            onClick={() => setOpen(false)}
                            disabled={setUs.isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="default"
                            className="flex-1"
                            onClick={handleSave}
                            disabled={!draft || setUs.isPending}
                        >
                            {setUs.isPending ? 'Saving…' : 'Save'}
                        </Button>
                    </div>
                </SheetContent>
            </Sheet>
        </>
    );
}
