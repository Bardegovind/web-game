'use strict';

const DEFAULT_COOLDOWN_MS = 60 * 1000;

/**
 * "Thinking of you" — one tap sends a heart to the other person.
 *
 * Live if she is there to receive the socket event, waiting on Today if she
 * is not. Throttled per sender rather than thrown on, so a double tap reads
 * as "already sent" instead of an error.
 */
function createNudgesService(deps) {
    const { Nudge } = deps;
    const now = deps.now || (() => new Date());
    const cooldownMs = deps.cooldownMs ?? DEFAULT_COOLDOWN_MS;

    async function send({ from, to }) {
        const sender = String(from).toLowerCase();
        const recipient = String(to).toLowerCase();

        const last = await Nudge.findOne({ from: sender }).sort({ createdAt: -1 }).lean();
        if (last) {
            const elapsed = now().getTime() - new Date(last.createdAt).getTime();
            if (elapsed < cooldownMs) {
                return { sent: false, reason: 'too-soon' };
            }
        }

        const created = await Nudge.create({
            from: sender,
            to: recipient,
            seenAt: null,
            createdAt: now(),
        });

        return {
            sent: true,
            nudge: { _id: created._id, from: created.from, to: created.to, createdAt: created.createdAt },
        };
    }

    /** What is waiting for them, newest first. */
    async function pending({ username }) {
        const me = String(username).toLowerCase();
        return Nudge.find({ to: me, seenAt: null }).sort({ createdAt: -1 }).lean();
    }

    /** Clears everything waiting for them at once; returns how many there were. */
    async function markSeen({ username }) {
        const me = String(username).toLowerCase();
        const result = await Nudge.updateMany({ to: me, seenAt: null }, { $set: { seenAt: now() } });
        return result.modifiedCount ?? result.nModified ?? 0;
    }

    return { send, pending, markSeen };
}

module.exports = { createNudgesService, DEFAULT_COOLDOWN_MS };
