import { useStory } from '../../hooks/useChamber';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/ErrorState';
import { formatDayLabel } from '../../utils/time';
import { HeartGlyph } from '../../app/LoveBackdrop';

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
                <Skeleton className="h-20 w-full rounded-[20px]" />
                <Skeleton className="h-20 w-full rounded-[20px]" />
                <Skeleton className="h-20 w-full rounded-[20px]" />
            </div>
        );
    }

    if (isError) return <ErrorState title="Couldn't load your story." onRetry={() => refetch()} />;

    const entries = data ?? [];

    if (entries.length === 0) {
        return (
            <div className="px-6 py-16 text-center">
                <p className="font-display text-lg font-semibold text-chalk">Nothing written down yet</p>
                <p className="mt-1 text-sm text-dust">The moments worth keeping go here.</p>
            </div>
        );
    }

    return (
        <div className="chamber-scroll mx-auto min-h-0 w-full max-w-2xl flex-1 overflow-y-auto px-4 pb-24">
            <ol className="relative py-6 pl-8">
                {/* The thread the moments hang from. */}
                <span
                    aria-hidden="true"
                    className="absolute top-0 bottom-0 left-[10px] w-px bg-gradient-to-b from-transparent via-lamp/35 to-transparent"
                />

                {entries.map((entry) => (
                    <li key={entry._id} className="relative mb-4 last:mb-0">
                        <span
                            aria-hidden="true"
                            className="absolute top-5 -left-8 flex h-[21px] w-[21px] items-center justify-center rounded-full border border-lamp/60 bg-ink text-[0.65rem] shadow-[0_0_14px_rgba(255,107,157,0.4)]"
                        >
                            {entry.emoji || <HeartGlyph size={8} className="text-lamp" />}
                        </span>

                        <div className="glass glass-hover p-4">
                            <h3 className="font-display text-[1.1rem] leading-snug font-semibold text-chalk">
                                {entry.title}
                            </h3>
                            <p className="mt-0.5 text-xs text-dust">
                                {formatDayLabel(entry.happenedAt)}
                                {entry.place && ` · ${entry.place}`}
                            </p>
                            {entry.note && (
                                <p className="mt-2 text-sm leading-relaxed text-chalk/80">{entry.note}</p>
                            )}
                            {entry.imageUrl && (
                                <img
                                    src={entry.imageUrl}
                                    alt=""
                                    loading="lazy"
                                    className="mt-3 max-h-64 w-full rounded-2xl object-cover"
                                />
                            )}
                        </div>
                    </li>
                ))}
            </ol>
        </div>
    );
}
