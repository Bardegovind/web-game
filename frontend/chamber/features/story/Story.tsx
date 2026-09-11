import { useStory } from '../../hooks/useChamber';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/ErrorState';
import { formatDayLabel } from '../../utils/time';

/**
 * The timeline.
 *
 * A vertical thread with the moments hung off it, oldest first, so it reads
 * forwards like a story rather than backwards like a feed.
 */
export function Story() {
    const { data, isLoading, isError, refetch } = useStory();

    if (isLoading) {
        return (
            <div className="space-y-4 p-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
            </div>
        );
    }

    if (isError) return <ErrorState title="Couldn't load your story." onRetry={() => refetch()} />;

    const entries = data ?? [];

    if (entries.length === 0) {
        return (
            <div className="px-6 py-16 text-center">
                <p className="font-display text-lg text-chalk">Nothing written down yet</p>
                <p className="mt-1 text-sm text-dust">The moments worth keeping go here.</p>
            </div>
        );
    }

    return (
        <div className="chamber-scroll mx-auto min-h-0 w-full max-w-2xl flex-1 overflow-y-auto px-4 pb-24">
            <ol className="relative py-6 pl-6">
                {/* The thread the moments hang from. */}
                <span
                    aria-hidden="true"
                    className="absolute top-0 bottom-0 left-[7px] w-px bg-gradient-to-b from-transparent via-hairline to-transparent"
                />

                {entries.map((entry) => (
                    <li key={entry._id} className="relative mb-8 last:mb-0">
                        <span
                            aria-hidden="true"
                            className="absolute top-2 -left-6 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-lamp-dim bg-ink text-[0.6rem]"
                        >
                            {entry.emoji || ''}
                        </span>

                        <p className="font-display text-xs text-dust italic">
                            {formatDayLabel(entry.happenedAt)}
                            {entry.place && ` · ${entry.place}`}
                        </p>
                        <h3 className="mt-1 font-display text-[1.15rem] text-chalk">{entry.title}</h3>
                        {entry.note && (
                            <p className="mt-1 text-sm leading-relaxed text-dust">{entry.note}</p>
                        )}
                        {entry.imageUrl && (
                            <img
                                src={entry.imageUrl}
                                alt=""
                                loading="lazy"
                                className="mt-3 max-h-64 w-full rounded-xl object-cover"
                            />
                        )}
                    </li>
                ))}
            </ol>
        </div>
    );
}
