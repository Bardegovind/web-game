/**
 * How times and dates read in the chamber.
 *
 * A bare clock time on every message is not enough. A conversation that spans
 * two evenings reads as though the clock ran backwards — 10:37 PM followed by
 * 10:07 PM looks like the messages are out of order when they are simply from
 * different days. Day labels are what make the history legible.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.TimeFormat = api;
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const MONTHS = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
    ];

    /** Accepts a Date, an ISO string, or anything else without throwing. */
    function toDate(value) {
        const date = value instanceof Date ? value : new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    /**
     * "9:28 PM" — no leading zero, so it reads the way someone would say it.
     */
    function formatTime(value) {
        const date = toDate(value);
        if (!date) return '';

        const hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const suffix = hours < 12 ? 'AM' : 'PM';

        // 0 and 12 both display as 12, which is what a clock face shows.
        const display = hours % 12 === 0 ? 12 : hours % 12;

        return `${display}:${minutes} ${suffix}`;
    }

    function isSameDay(a, b) {
        const first = toDate(a);
        const second = toDate(b);
        if (!first || !second) return false;

        return first.getFullYear() === second.getFullYear()
            && first.getMonth() === second.getMonth()
            && first.getDate() === second.getDate();
    }

    /**
     * "Today", "Yesterday", "29 March", or "25 December 2025".
     *
     * The year only appears when it is not the current one — including it on
     * every old message is noise.
     */
    function formatDayLabel(value, now) {
        const date = toDate(value);
        if (!date) return '';

        const today = toDate(now) || new Date();

        if (isSameDay(date, today)) return 'Today';

        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        if (isSameDay(date, yesterday)) return 'Yesterday';

        const day = date.getDate();
        const month = MONTHS[date.getMonth()];

        if (date.getFullYear() === today.getFullYear()) {
            return `${day} ${month}`;
        }

        return `${day} ${month} ${date.getFullYear()}`;
    }

    return { formatTime, formatDayLabel, isSameDay };
});
