'use strict';

const { EVENTS, roomFor } = require('../socket/events');

const DEFAULT_TTL_MS = 3000;

/**
 * "typing..." with a server-side deadline.
 *
 * The client is expected to send a stop event, but it cannot be relied on to:
 * the tab closes, the network drops, the socket dies mid-keystroke. Without an
 * expiry the other person is left looking at "typing..." forever, which reads
 * as the app being broken.
 *
 * So the server starts a timer on every start event and stops on its own if
 * nothing arrives before it fires.
 */
function createTypingService(deps) {
    const options = deps || {};
    const io = options.io;
    const ttlMs = options.ttlMs || DEFAULT_TTL_MS;
    const schedule = options.setTimeout || setTimeout;
    const cancel = options.clearTimeout || clearTimeout;

    /** "from|to" -> timer handle. One pending expiry per conversation. */
    const pending = new Map();

    const normalise = (name) => String(name).toLowerCase();
    const keyFor = (from, to) => `${from}|${to}`;

    function clearPending(key) {
        const handle = pending.get(key);
        if (handle === undefined) return;

        cancel(handle);
        pending.delete(key);
    }

    function emitStop(from, to) {
        io.to(roomFor(to)).emit(EVENTS.TYPING_STOP, { sender: from });
    }

    function start(rawFrom, rawTo) {
        const from = normalise(rawFrom);
        const to = normalise(rawTo);
        const key = keyFor(from, to);

        // Still typing: push the deadline back rather than stacking timers.
        clearPending(key);

        io.to(roomFor(to)).emit(EVENTS.TYPING_START, { sender: from });

        pending.set(key, schedule(() => {
            pending.delete(key);
            emitStop(from, to);
        }, ttlMs));
    }

    function stop(rawFrom, rawTo) {
        const from = normalise(rawFrom);
        const to = normalise(rawTo);

        clearPending(keyFor(from, to));
        emitStop(from, to);
    }

    /** Called when a socket goes away, so their indicator does not linger. */
    function clearAllFor(rawFrom) {
        const from = normalise(rawFrom);

        for (const key of Array.from(pending.keys())) {
            if (!key.startsWith(`${from}|`)) continue;

            clearPending(key);
            emitStop(from, key.slice(from.length + 1));
        }
    }

    return { start, stop, clearAllFor };
}

module.exports = { createTypingService };
