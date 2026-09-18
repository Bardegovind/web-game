'use strict';

/**
 * "Us" — days together, counting toward the next anniversary.
 *
 * The start date is editable, but nothing has to be set before it means
 * something: absent a stored date, the count still starts from the first
 * message they ever sent each other, and only falls back to today when there
 * is truly nothing else to go on.
 */

/** Midnight on the given date, in local time — so two Dates on the same
 * calendar day always compare as the same day regardless of the clock. */
function midnight(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Whole calendar days from `a` to `b`. Negative if `b` is before `a`. */
function daysBetween(a, b) {
    return Math.round((midnight(b).getTime() - midnight(a).getTime()) / 86400000);
}

function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * The anniversary date in a given year.
 *
 * A relationship that started on 29 February has no anniversary most years —
 * treating the day as 1 March in those years is kinder than pretending it
 * does not come around at all.
 */
function anniversaryInYear(month, day, year) {
    if (month === 1 && day === 29 && !isLeapYear(year)) {
        return new Date(year, 2, 1);
    }
    return new Date(year, month, day);
}

/** The next occurrence of the start date's month and day, on or after `at`. */
function nextAnniversaryDate(startDate, at) {
    const month = startDate.getMonth();
    const day = startDate.getDate();
    const today = midnight(at);

    let candidate = anniversaryInYear(month, day, today.getFullYear());
    if (candidate < today) {
        candidate = anniversaryInYear(month, day, today.getFullYear() + 1);
    }
    return candidate;
}

function createRelationshipService(deps) {
    const { Relationship, Message } = deps;
    const now = deps.now || (() => new Date());

    /** The earliest message either of them ever sent, if any exist yet. */
    async function firstMessageDate() {
        if (!Message) return null;
        const earliest = await Message.findOne({}).sort({ createdAt: 1 }).select('createdAt').lean();
        return earliest ? earliest.createdAt : null;
    }

    /**
     * The start date, and where it came from.
     *
     * `'set'` once someone has chosen one; until then `'first-message'` from
     * whenever they first spoke, so the count means something from day one;
     * `'today'` only when there is nothing at all to anchor to yet.
     */
    async function get() {
        const stored = await Relationship.findOne({}).lean();
        if (stored) return { startDate: stored.startDate, source: 'set' };

        const firstMessage = await firstMessageDate();
        if (firstMessage) return { startDate: firstMessage, source: 'first-message' };

        return { startDate: now(), source: 'today' };
    }

    function isValidDate(value) {
        return value instanceof Date && !Number.isNaN(value.getTime());
    }

    /**
     * Sets the day it started. Upserts the single row rather than piling up
     * a history of edits — the chamber only ever needs today's answer.
     */
    async function set({ date, username }) {
        const parsed = date instanceof Date ? date : new Date(date);
        if (!isValidDate(parsed)) {
            throw new Error('That does not look like a real date.');
        }
        if (parsed.getTime() > now().getTime()) {
            throw new Error('That has not happened yet.');
        }

        const updatedBy = username ? String(username).toLowerCase() : null;

        await Relationship.findOneAndUpdate(
            {},
            { startDate: parsed, updatedBy },
            { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
        );

        return { startDate: parsed, source: 'set' };
    }

    /** How many days it has been, as of `at` (defaulting to now). */
    async function daysTogether(at) {
        const { startDate } = await get();
        return daysBetween(new Date(startDate), at || now());
    }

    /** The next anniversary, as of `at` (defaulting to now). */
    async function nextAnniversary(at) {
        const moment = at || now();
        const { startDate } = await get();
        const start = new Date(startDate);
        const date = nextAnniversaryDate(start, moment);

        return {
            date,
            daysAway: daysBetween(moment, date),
            yearsCompleted: date.getFullYear() - start.getFullYear(),
        };
    }

    return { get, set, daysTogether, nextAnniversary };
}

module.exports = { createRelationshipService, daysBetween, nextAnniversaryDate };
