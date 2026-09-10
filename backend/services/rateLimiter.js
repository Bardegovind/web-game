'use strict';

/**
 * Failed-attempt limiter.
 *
 * The chamber is guarded by a password and nothing else, so an unlimited number
 * of guesses is the whole attack. In memory is the right size for this: two
 * people, one process. It resets on restart, which is an acceptable trade for
 * having no infrastructure to run.
 */

const DEFAULT_MAX = 5;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;

function createRateLimiter(options) {
    const config = options || {};
    const max = config.max || DEFAULT_MAX;
    const windowMs = config.windowMs || DEFAULT_WINDOW_MS;
    const now = config.now || Date.now;

    /** key -> { failures, firstFailureAt } */
    const attempts = new Map();

    function isExpired(entry, at) {
        return at - entry.firstFailureAt > windowMs;
    }

    /** Drop entries whose window has closed, so the map tracks only live guessers. */
    function sweep(at) {
        for (const [key, entry] of attempts) {
            if (isExpired(entry, at)) attempts.delete(key);
        }
    }

    function check(key) {
        const at = now();
        sweep(at);

        const entry = attempts.get(key);

        if (!entry || entry.failures < max) {
            return { allowed: true };
        }

        return {
            allowed: false,
            retryAfterMs: windowMs - (at - entry.firstFailureAt),
        };
    }

    function recordFailure(key) {
        const at = now();
        const entry = attempts.get(key);

        if (!entry || isExpired(entry, at)) {
            attempts.set(key, { failures: 1, firstFailureAt: at });
            return;
        }

        entry.failures += 1;
    }

    /** A correct password clears the slate — a typo should not count against her later. */
    function recordSuccess(key) {
        attempts.delete(key);
    }

    return {
        check,
        recordFailure,
        recordSuccess,
        get size() { return attempts.size; },
    };
}

module.exports = { createRateLimiter };
