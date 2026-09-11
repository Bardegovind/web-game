/**
 * A conversation spanning two evenings reads as though the clock ran backwards
 * without this: 10:37 PM followed by 10:07 PM looks scrambled when the second
 * message is simply from the next day.
 */
export function DaySeparator({ label }: { label: string }) {
    return (
        <div className="my-5 flex items-center gap-3" role="separator" aria-label={label}>
            <span className="h-px flex-1 bg-hairline" />
            <span className="font-display text-[0.7rem] tracking-wide text-dust italic">
                {label}
            </span>
            <span className="h-px flex-1 bg-hairline" />
        </div>
    );
}
