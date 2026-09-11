/**
 * How times and dates read in the chamber.
 *
 * A bare clock time on every message is not enough: a conversation spanning two
 * evenings reads as though the clock ran backwards — 10:37 PM followed by
 * 10:07 PM looks out of order when the messages are simply from different days.
 */

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
] as const;

function toDate(value: string | Date | null | undefined): Date | null {
    if (value == null) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

/** "9:28 PM" — no leading zero, the way someone would say it. */
export function formatTime(value: string | Date | null | undefined): string {
    const date = toDate(value);
    if (!date) return '';

    const hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const suffix = hours < 12 ? 'AM' : 'PM';
    const display = hours % 12 === 0 ? 12 : hours % 12;

    return `${display}:${minutes} ${suffix}`;
}

export function isSameDay(a: string | Date | null, b: string | Date | null): boolean {
    const first = toDate(a);
    const second = toDate(b);
    if (!first || !second) return false;

    return first.getFullYear() === second.getFullYear()
        && first.getMonth() === second.getMonth()
        && first.getDate() === second.getDate();
}

/** "Today", "Yesterday", "29 March", "25 December 2025". */
export function formatDayLabel(value: string | Date | null, now?: Date): string {
    const date = toDate(value);
    if (!date) return '';

    const today = now ?? new Date();
    if (isSameDay(date, today)) return 'Today';

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (isSameDay(date, yesterday)) return 'Yesterday';

    const month = MONTHS[date.getMonth()] ?? '';
    if (date.getFullYear() === today.getFullYear()) {
        return `${date.getDate()} ${month}`;
    }
    return `${date.getDate()} ${month} ${date.getFullYear()}`;
}

/** "just now", "8 minutes ago", "Yesterday" — for last-seen. */
export function formatLastSeen(value: string | Date | null): string {
    const date = toDate(value);
    if (!date) return '';

    const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

    return formatDayLabel(date);
}
