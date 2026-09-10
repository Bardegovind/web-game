/**
 * Chamber — main controller that ties everything together
 *
 * - Initializes hidden tap zones
 * - Manages view switching (game ↔ chamber)
 * - Handles tab navigation (gallery / chat)
 */
const chamber = {

    taps: null,

    init() {
        // ---- HIDDEN TAP ZONES ----
        // The ritual is unchanged: 16 on the top-left, 3 on the top-right,
        // 7 on the bottom-right. Only the detection is stricter now.
        this.taps = TapZones.createTapZones({
            onUnlock: () => auth.open(),
        });
        this.taps.arm();

        // ---- TAB NAVIGATION ----
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                this.switchTab(tab);
            });
        });

        // ---- EXIT BUTTON ----
        document.getElementById('btn-exit-chamber').addEventListener('click', () => {
            this.exitChamber();
        });
    },

    /**
     * Enter the secret chamber
     */
    enter(username) {
        // Switch views
        document.getElementById('game-view').classList.remove('active');
        document.getElementById('chamber-view').classList.add('active');

        // Set username display
        document.getElementById('chamber-username').textContent = `@${username}`;

        // Load gallery
        gallery.loadImages();

        // Connect chat
        chat.connect(username);

        // Default to gallery tab
        this.switchTab('gallery');
    },

    /**
     * Exit the secret chamber — back to game
     * Switch top-level view (Game, Rules, About, Chamber)
     */
    switchMainView(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        const targetView = document.getElementById(viewId);
        if (targetView) targetView.classList.add('active');

        // Update Navbar Active Link
        document.querySelectorAll('.nav-link').forEach(link => {
            const isTarget = link.getAttribute('onclick')?.includes(viewId);
            link.classList.toggle('active', isTarget);
        });

        // Hide Navbar if we're in the Secret Chamber or a Modal
        const navbar = document.querySelector('.navbar');
        if (viewId === 'chamber-view') {
            navbar.style.display = 'none';
        } else {
            navbar.style.display = 'block';
        }
    },

    /**
     * Open the password modal
     */
    openPasswordModal() {
        this.passwordModal.classList.add('active');
    },

    /**
     * Close the password modal
     */
    closePasswordModal() {
        this.passwordModal.classList.remove('active');
        auth.clearInputs();
    },

    /**
     * Switch between Gallery and Chat tabs inside the Chamber
     */
    switchTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `tab-${tabName}`);
        });

        if (tabName === 'chat') {
            chat.scrollToBottom();
        }
    },

    /**
     * Exit the secret chamber
     */
    exitChamber() {
        chat.disconnect();
        // Switch back to game view
        document.getElementById('chamber-view').classList.remove('active');
        document.getElementById('game-view').classList.add('active');
        // Back on the game screen: clear any progress and listen again.
        if (this.taps) this.taps.rearm();
    }
};

// Global click handlers for tabs
document.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('.tab-btn');
    if (tabBtn) {
        chamber.switchTab(tabBtn.dataset.tab);
    }
});

document.addEventListener('DOMContentLoaded', () => {
    chamber.init();
});

// Auto-exit Secret Chamber when screen turns off / tab switches / app minimized
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        const chamberView = document.getElementById('chamber-view');
        if (chamberView && chamberView.classList.contains('active')) {
            chamber.exitChamber();
        }
    }
});
