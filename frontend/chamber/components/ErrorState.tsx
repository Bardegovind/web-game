import { RotateCw } from 'lucide-react';

/**
 * One part failing must not take the room down with it.
 *
 * Says what did not load and offers the way forward, in the room's voice —
 * never a status code, never "undefined".
 */
export function ErrorState({
    title,
    onRetry,
}: {
    title: string;
    onRetry?: () => void;
}) {
    return (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
            <p className="max-w-xs text-sm leading-relaxed text-dust">{title}</p>
            {onRetry && (
                <button
                    type="button"
                    onClick={onRetry}
                    className="inline-flex items-center gap-2 rounded-full border border-hairline px-4 py-2 text-sm text-chalk transition-colors hover:border-lamp-dim hover:text-lamp"
                >
                    <RotateCw size={14} aria-hidden="true" />
                    Try again
                </button>
            )}
        </div>
    );
}
