/**
 * Tap sequence — pure state machine for the hidden chamber entrance.
 *
 * No DOM, no timers, no globals. Feed it (zoneId, timestamp) and it tells you
 * what happened. The DOM adapter lives in tapZones.js.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.TapSequence = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    // The ritual. Frozen — she already knows it.
    const DEFAULT_SEQUENCE = [
        { zone: 1, required: 16 },
        { zone: 2, required: 3 },
        { zone: 3, required: 7 },
    ];

    // Her rhythm. Unchanged from the original.
    const DEFAULT_IDLE_MS = 8000;

    // Off by default, and that is a measured decision rather than an omission.
    //
    // A debounce exists to swallow a duplicate event from one physical tap. The
    // adapter binds pointerdown alone, and instrumenting a real browser showed
    // 16 taps producing exactly 16 pointerdown events with no duplicates at all —
    // so there is nothing for it to swallow. Any non-zero floor only creates the
    // risk of dropping a real tap.
    //
    // The failure modes are not symmetric either. Swallow a real tap and she taps
    // sixteen times, gets fifteen, and has to keep going — precisely the bug this
    // detector exists to remove. Let a duplicate through and she needs one tap
    // fewer, which nobody notices. When in doubt, count the tap.
    //
    // Still configurable via `debounceMs` should a future input path ever emit
    // genuine duplicates.
    const DEFAULT_DEBOUNCE_MS = 0;

    function createTapSequence(options) {
        const opts = options || {};
        const sequence = opts.sequence || DEFAULT_SEQUENCE;
        const idleMs = opts.idleMs != null ? opts.idleMs : DEFAULT_IDLE_MS;
        const debounceMs = opts.debounceMs != null ? opts.debounceMs : DEFAULT_DEBOUNCE_MS;
        const knownZones = new Set(sequence.map(function (s) { return s.zone; }));

        let step = 0;
        let count = 0;
        let lastTapAt = null;

        function clear() {
            step = 0;
            count = 0;
            lastTapAt = null;
            machine.state = 'IDLE';
        }

        const machine = {
            state: 'IDLE',

            tap(zoneId, now) {
                // Already through the door. Never fire twice.
                if (machine.state === 'UNLOCKED') {
                    return { unlocked: false, ignored: true };
                }

                // A tap somewhere else on the screen is not part of the ritual.
                // Ignore it rather than punishing a near-miss on a 100px corner.
                if (!knownZones.has(zoneId)) {
                    return { unlocked: false, ignored: true };
                }

                let timedOut = false;

                // She walked away mid-run. Abandon it, but let this tap start a fresh one.
                if (lastTapAt !== null && now - lastTapAt > idleMs) {
                    clear();
                    timedOut = true;
                }

                // A duplicate event riding on the same physical tap. Not a second tap.
                if (debounceMs > 0 && lastTapAt !== null && now - lastTapAt < debounceMs) {
                    return { unlocked: false, ignored: true, debounced: true };
                }

                const expected = sequence[step];

                if (zoneId !== expected.zone) {
                    clear();
                    return { unlocked: false, reset: true };
                }

                count += 1;
                lastTapAt = now;
                machine.state = 'ARMED';

                if (count >= expected.required) {
                    step += 1;
                    count = 0;

                    if (step >= sequence.length) {
                        machine.state = 'UNLOCKED';
                        return { unlocked: true, timedOut: timedOut || undefined };
                    }

                    // The boundary between corners, reported on its own so it can
                    // be made to feel different. Sixteen identical buzzes cannot be
                    // counted by feel, and landing one short or one over sends her
                    // back to the start — after which the next corner does nothing
                    // and says nothing, which reads as that corner being broken.
                    return {
                        unlocked: false,
                        progressed: true,
                        stepCompleted: true,
                        timedOut: timedOut || undefined,
                    };
                }

                return { unlocked: false, progressed: true, timedOut: timedOut || undefined };
            },

            reset() {
                clear();
            },
        };

        return machine;
    }

    return { createTapSequence };
});
