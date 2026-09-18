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

    /** The class every glint of light carries, so tests can find them. */
    const LIGHT_CLASS = 'tap-light';

    /** How long the light lives before it is taken out of the page again. */
    const LIGHT_LIFETIME_MS = 600;

    /** The pause before the second glint and tick that mean "this corner is done". */
    const SECOND_CUE_MS = 150;

    /**
     * What each moment feels like.
     *
     * Every tap that lands on a corner is felt the same way: one short, soft
     * tick, so the hand knows the tap registered and the count moved. The long
     * buzz that used to mean "that did not count" is gone — on a real phone it
     * read as "the button did not click", which is the opposite of the truth.
     *
     * TICK       a tap landed.
     * STEP_DONE  this corner is finished, move to the next one. Two soft ticks,
     *            because sixteen identical ones cannot be counted by feel.
     * UNLOCKED   the door is opening.
     */
    const HAPTICS = {
        TICK: 10,
        STEP_DONE: [10, 60, 10],
        UNLOCKED: [10, 60, 10, 60, 10],
    };

    function createTapZones(options) {
        const opts = options || {};
        const doc = opts.document || document;
        const onUnlock = opts.onUnlock || function () {};
        const clock = opts.now || function () { return Date.now(); };
        const sequence = opts.sequence || TapSequence.createTapSequence(opts.sequenceOptions);

        let bindings = [];

        /**
         * Felt only by the hand holding the phone, and never loud.
         *
         * The cost, accepted on purpose: someone idly tapping a corner feels it
         * too, which makes the corners slightly discoverable. The alternative
         * was a corner that went quiet whenever she was one tap out, which she
         * could not tell apart from a broken one.
         */
        function feel(pattern) {
            if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;

            try {
                navigator.vibrate(pattern);
            } catch (error) {
                // Unsupported or blocked. The sequence works regardless.
            }
        }

        /**
         * A glint of light where the finger landed, so a tap can be counted by
         * eye as well as felt. It takes itself out of the page again, and it
         * never catches a tap of its own.
         */
        function glint(x, y) {
            const body = doc.body;
            if (!body) return;

            const light = doc.createElement('span');
            light.className = LIGHT_CLASS;
            light.setAttribute('aria-hidden', 'true');
            light.style.left = x + 'px';
            light.style.top = y + 'px';

            let done = false;
            const remove = function () {
                if (done) return;
                done = true;
                if (light.parentNode) light.parentNode.removeChild(light);
            };

            light.addEventListener('animationend', remove);
            body.appendChild(light);
            // A fallback for the case where the animation never runs at all.
            setTimeout(remove, LIGHT_LIFETIME_MS);
        }

        function handlePointerDown(zoneId) {
            return function (event) {
                // Keep the corner inert: no text selection, no synthesized click,
                // no scroll gesture starting from a deliberate tap.
                event.preventDefault();

                const x = typeof event.clientX === 'number' ? event.clientX : 0;
                const y = typeof event.clientY === 'number' ? event.clientY : 0;

                const result = sequence.tap(zoneId, clock());

                // Every tap on a corner is answered, whether it counted or sent
                // her back to the start: the hand and the eye both confirm the
                // touch landed, and nothing shouts about a miscount.
                glint(x, y);

                if (result.unlocked) {
                    feel(HAPTICS.UNLOCKED);
                } else if (result.stepCompleted) {
                    feel(HAPTICS.STEP_DONE);
                    setTimeout(function () { glint(x, y); }, SECOND_CUE_MS);
                } else {
                    feel(HAPTICS.TICK);
                }

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

    return { createTapZones: createTapZones, HAPTICS: HAPTICS, LIGHT_CLASS: LIGHT_CLASS };
});
