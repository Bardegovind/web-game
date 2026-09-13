/**
 * Placeholder shapes while something loads.
 *
 * She should never see a spinner or an empty rectangle that might be a
 * failure — the shape of what is coming is itself reassurance.
 */
export function Skeleton({ className = '' }: { className?: string }) {
    return (
        <div
            data-skeleton=""
            className={`animate-pulse rounded-lg bg-velvet-lifted/70 ${className}`}
            aria-hidden="true"
        />
    );
}

export function MessageSkeleton() {
    return (
        <div className="space-y-3 px-1 py-2">
            <Skeleton className="ml-auto h-10 w-40" />
            <Skeleton className="h-10 w-52" />
            <Skeleton className="ml-auto h-10 w-32" />
            <Skeleton className="h-10 w-44" />
        </div>
    );
}
