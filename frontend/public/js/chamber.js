/**
 * The bridge between the game and the chamber.
 *
 * The entrance ritual stays here, in vanilla JS, exactly as it always was —
 * three corners, 16 then 3 then 7, and the password. Everything behind the
 * password is React, and this file is the whole seam between the two.
 */
const chamber = {
    taps: null,

    init() {
        // The ritual is frozen. Only the detection behind it is a state machine.
        this.taps = TapZones.createTapZones({
            onUnlock: () => auth.open(),
        });
        this.taps.arm();

        // React tells us when she has left so the corners start listening again.
        window.addEventListener('chamber:left', () => this.onLeft());
    },

    /** Hands over to the chamber. React takes it from here. */
    enter(username, token) {
        document.getElementById('game-view').classList.remove('active');
        window.dispatchEvent(
            new CustomEvent('chamber:enter', { detail: { username, token } })
        );
    },

    /** Back on the game screen: clear any progress and listen again. */
    onLeft() {
        document.getElementById('game-view').classList.add('active');
        if (this.taps) this.taps.rearm();
    },

    /** Used by the auto-exit below; asks React to close. */
    exit() {
        window.dispatchEvent(new CustomEvent('chamber:exit'));
        this.onLeft();
    },
};

document.addEventListener('DOMContentLoaded', () => chamber.init());

// Leaving the tab closes the chamber. Someone glancing at the phone afterwards
// finds a game of noughts and crosses.
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    if (document.getElementById('game-view').classList.contains('active')) return;
    chamber.exit();
});
