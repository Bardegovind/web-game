/**
 * Tap zones — binds the three hidden corners to the tap sequence state machine.
 *
 * Listens on `pointerdown` rather than `click`. One event covers mouse, touch and
 * pen, and it fires the moment the finger lands, so a press that slides off the
 * corner — or one the browser swallows while deciding whether it was a
 * double-tap-zoom — still counts. Paired with `touch-action: manipulation` on the
 * zones themselves, that is what makes sixteen taps mean sixteen.
 *
 * The state machine owns the idle timeout: it compares timestamps on the next tap
 * rather than running a timer, which is observably identical and cannot leak.
 */
(function (root, factory) {
    const api = factory(
        typeof module === 'object' && module.exports
            ? require('./tapSequence.js')
            : root.TapSequence
    );

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.TapZones = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (TapSequence) {
    'use strict';

    const ZONE_SELECTOR = '[data-tap]';

    function createTapZones(options) {
        const opts = options || {};
        const doc = opts.document || document;
        const onUnlock = opts.onUnlock || function () {};
        const clock = opts.now || function () { return Date.now(); };
        const sequence = opts.sequence || TapSequence.createTapSequence(opts.sequenceOptions);

        let bindings = [];

        function handlePointerDown(zoneId) {
            return function (event) {
                // Keep the corner inert: no text selection, no synthesized click,
                // no scroll gesture starting from a deliberate tap.
                event.preventDefault();

                const result = sequence.tap(zoneId, clock());

                if (result.unlocked) {
                    disarm();
                    onUnlock();
                }
            };
        }

        function arm() {
            if (bindings.length > 0) return;

            const zones = doc.querySelectorAll(ZONE_SELECTOR);

            zones.forEach(function (zone) {
                const zoneId = Number(zone.getAttribute('data-tap'));
                if (!Number.isFinite(zoneId)) return;

                const listener = handlePointerDown(zoneId);
                zone.addEventListener('pointerdown', listener);
                bindings.push({ zone: zone, listener: listener });
            });
        }

        /**
         * Detach entirely. Used the moment the door opens, so nothing can count a
         * stray tap behind the password dialog or fire the unlock twice.
         */
        function disarm() {
            bindings.forEach(function (binding) {
                binding.zone.removeEventListener('pointerdown', binding.listener);
            });
            bindings = [];
        }

        /** Back to the game screen: clear progress and listen again. */
        function rearm() {
            sequence.reset();
            arm();
        }

        return {
            arm: arm,
            disarm: disarm,
            rearm: rearm,
            reset: function () { sequence.reset(); },
            get armed() { return bindings.length > 0; },
            get state() { return sequence.state; },
        };
    }

    return { createTapZones: createTapZones };
});
