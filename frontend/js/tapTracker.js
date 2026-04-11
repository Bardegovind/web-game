/**
 * Tap Tracker — tracks the hidden 16 → 3 → 7 pattern
 *
 * 3 invisible buttons on the game screen:
 *   - Button 1 (top-left): must be tapped 16 times
 *   - Button 2 (top-right): must be tapped 3 times
 *   - Button 3 (bottom-right): must be tapped 7 times
 *
 * Taps must happen in sequence. If wrong button is tapped, resets.
 */
const tapTracker = {
    // Required taps for each button (in order)
    sequence: [
        { button: 1, required: 16 },
        { button: 2, required: 3 },
        { button: 3, required: 7 },
    ],

    currentStep: 0,   // Which step in the sequence (0, 1, 2)
    currentCount: 0,   // How many taps on current step

    // Timeout — if user doesn't tap within 5 seconds, reset
    timeout: null,
    TIMEOUT_MS: 8000,

    /**
     * Called when a hidden button is tapped
     * @param {number} buttonId - 1, 2, or 3
     * @returns {boolean} true if full pattern completed
     */
    tap(buttonId) {
        const expected = this.sequence[this.currentStep];

        // Wrong button? Reset everything
        if (buttonId !== expected.button) {
            this.reset();
            return false;
        }

        // Correct button — increment count
        this.currentCount++;
        this._resetTimeout();

        // Debug (uncomment for development)
        // console.log(`Tap: Button ${buttonId}, Count: ${this.currentCount}/${expected.required}, Step: ${this.currentStep + 1}/3`);

        // Check if current step is complete
        if (this.currentCount >= expected.required) {
            this.currentStep++;
            this.currentCount = 0;

            // All 3 steps complete?
            if (this.currentStep >= this.sequence.length) {
                this.reset();
                return true; // 🎉 Pattern complete!
            }
        }

        return false;
    },

    /**
     * Reset all progress
     */
    reset() {
        this.currentStep = 0;
        this.currentCount = 0;
        clearTimeout(this.timeout);
        this.timeout = null;
    },

    /**
     * Auto-reset if user stops tapping for too long
     */
    _resetTimeout() {
        clearTimeout(this.timeout);
        this.timeout = setTimeout(() => {
            this.reset();
        }, this.TIMEOUT_MS);
    },
};
