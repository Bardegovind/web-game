'use strict';

const { dayKey, pickForDay } = require('./daily.service');

const MAX_LENGTH = 200;

/**
 * A jar of short "why I love you" notes.
 *
 * Either of them can drop one in or take their own back out; one is surfaced
 * on Today, the same one for both of them, chosen by the date the same way
 * the daily question is — so nothing has to be scheduled or kept in step.
 */
function createReasonsService(deps) {
    const { Reason } = deps;
    const now = deps.now || (() => new Date());

    /** Newest first — the jar reads like a feed, not an archive. */
    async function list() {
        // The id breaks a tie: two reasons written in the same millisecond would
        // otherwise be ordered differently between reads, and the reason of the
        // day is picked by position.
        return Reason.find({}).sort({ createdAt: -1, _id: -1 }).lean();
    }

    async function add({ text, author }) {
        if (typeof text !== 'string' || !text.trim()) {
            throw new Error('A reason needs some words in it.');
        }

        const trimmed = text.trim();
        if (trimmed.length > MAX_LENGTH) {
            throw new Error(`Keep it to ${MAX_LENGTH} characters.`);
        }

        return Reason.create({
            text: trimmed,
            author: String(author).toLowerCase(),
        });
    }

    /** Only the person who wrote it can take it back out. */
    async function remove({ id, author }) {
        const reason = await Reason.findById(id);
        if (!reason) throw new Error('That reason is not in the jar.');

        if (reason.author !== String(author).toLowerCase()) {
            throw new Error('Only whoever wrote it can take it back out.');
        }

        await Reason.deleteOne({ _id: id });
        return true;
    }

    /**
     * The reason surfaced today — the same one for both of them, picked
     * deterministically from the day rather than drawn fresh each call.
     */
    async function ofTheDay({ date } = {}) {
        const day = dayKey(date || now());
        const all = await list();
        return pickForDay(all, day);
    }

    return { list, add, remove, ofTheDay };
}

module.exports = { createReasonsService, MAX_LENGTH };
