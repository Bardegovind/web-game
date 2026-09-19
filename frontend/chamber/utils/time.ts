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

/**
 * "17 April 2024 at 1:46 PM" — a fixed moment, said in full.
 *
 * Deliberately not `formatDayLabel`: that one is for a stream of messages and
 * says "Today", which is true for an hour and wrong forever after. The day
 * they met is a fact, so it always carries its date, its year and its time.
 */
export function formatMoment(value: string | Date | null | undefined): string {
    const date = toDate(value);
    if (!date) return '';

    const month = MONTHS[date.getMonth()] ?? '';
    return `${date.getDate()} ${month} ${date.getFullYear()} at ${formatTime(date)}`;
}

/** "1 year, 2 months, 6 days" — a calendar-aware breakdown, not a division. */
export function formatTogether(startDate: string | Date | null, now?: Date): string {
    const start = toDate(startDate);
    if (!start) return '';

    const at = now ?? new Date();
    let years = at.getFullYear() - start.getFullYear();
    let months = at.getMonth() - start.getMonth();
    let days = at.getDate() - start.getDate();

    if (days < 0) {
        months -= 1;
        // The last day of the month before `at`: how many days a short
        // borrow actually carries.
        const borrowedFrom = new Date(at.getFullYear(), at.getMonth(), 0);
        days += borrowedFrom.getDate();
    }
    if (months < 0) {
        years -= 1;
        months += 12;
    }

    const parts: string[] = [];
    if (years > 0) parts.push(`${years} year${years === 1 ? '' : 's'}`);
    if (months > 0) parts.push(`${months} month${months === 1 ? '' : 's'}`);
    if (days > 0 || parts.length === 0) parts.push(`${days} day${days === 1 ? '' : 's'}`);

    return parts.join(', ');
}
