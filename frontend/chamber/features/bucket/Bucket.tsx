import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Plus } from 'lucide-react';

import { useAddBucketItem, useBucket, useToggleBucketItem } from '../../hooks/useChamber';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/ErrorState';

/** Things the two of them mean to do. Either can add one or tick it off. */
export function Bucket() {
    const { data, isLoading, isError, refetch } = useBucket();
    const add = useAddBucketItem();
    const toggle = useToggleBucketItem();
    const [text, setText] = useState('');

    if (isLoading) {
        return (
            <div className="space-y-2 p-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
            </div>
        );
    }

    if (isError) return <ErrorState title="Couldn't load your list." onRetry={() => refetch()} />;

    const items = data ?? [];
    const done = items.filter((i) => i.done).length;

    function submit() {
        const trimmed = text.trim();
        if (!trimmed) return;
        add.mutate(trimmed);
        setText('');
    }

    return (
        <div className="chamber-scroll mx-auto min-h-0 w-full max-w-2xl flex-1 overflow-y-auto px-4 pb-24">
            <div className="flex items-baseline justify-between py-4">
                <h2 className="font-display text-lg text-chalk">Things to do</h2>
                {items.length > 0 && (
                    <span className="text-xs text-dust">
                        {done} of {items.length}
                    </span>
                )}
            </div>

            <div className="mb-5 flex gap-2">
                <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submit()}
                    placeholder="Something we should do"
                    className="flex-1 rounded-2xl border border-hairline bg-velvet px-4 py-2.5 text-sm text-chalk placeholder:text-dust/70 focus:border-lamp-dim focus:outline-none"
                />
                <button
                    type="button"
                    onClick={submit}
                    disabled={!text.trim() || add.isPending}
                    aria-label="Add to the list"
                    className="rounded-2xl bg-lamp px-4 text-ink transition-opacity disabled:opacity-30"
                >
                    <Plus size={18} />
                </button>
            </div>

            {items.length === 0 ? (
                <p className="px-2 py-10 text-center text-sm text-dust">
                    Nothing on the list yet. Add the first thing.
                </p>
            ) : (
                <ul className="space-y-1.5">
                    {items.map((item) => (
                        <li key={item._id}>
                            <motion.button
                                type="button"
                                whileTap={{ scale: 0.99 }}
                                onClick={() => toggle.mutate(item._id)}
                                className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-velvet"
                            >
                                <span
                                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                                        item.done ? 'border-lamp bg-lamp text-ink' : 'border-dust/50'
                                    }`}
                                >
                                    {item.done && <Check size={13} strokeWidth={3} />}
                                </span>
                                <span
                                    className={`min-w-0 flex-1 text-[0.95rem] ${
                                        item.done ? 'text-dust line-through' : 'text-chalk'
                                    }`}
                                >
                                    {item.text}
                                </span>
                            </motion.button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
