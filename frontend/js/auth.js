/**
 * Auth — handles password modal and verification
 */
const auth = {
    modal: null,
    usernameInput: null,
    passwordInput: null,
    errorEl: null,
    submitBtn: null,
    cancelBtn: null,

    init() {
        this.modal = document.getElementById('password-modal');
        this.usernameInput = document.getElementById('input-username');
        this.passwordInput = document.getElementById('input-password');
        this.errorEl = document.getElementById('modal-error');
        this.submitBtn = document.getElementById('btn-submit-password');
        this.cancelBtn = document.getElementById('btn-cancel-password');

        this.submitBtn.addEventListener('click', () => this.submit());
        this.cancelBtn.addEventListener('click', () => this.close());

        // Enter key to submit
        this.passwordInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.submit();
        });
        this.usernameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.passwordInput.focus();
        });
    },

    /**
     * Show the password modal
     */
    open() {
        this.modal.classList.add('show');
        this.errorEl.textContent = '';
        this.usernameInput.value = '';
        this.passwordInput.value = '';
        setTimeout(() => this.usernameInput.focus(), 300);
    },

    /**
     * Hide the password modal
     */
    close() {
        this.modal.classList.remove('show');
        this.errorEl.textContent = '';
    },

    /**
     * Submit password + username for verification
     */
    async submit() {
        const username = this.usernameInput.value.trim();
        const password = this.passwordInput.value.trim();

        if (!username) {
            this.errorEl.textContent = 'Please enter a username.';
            this.usernameInput.focus();
            return;
        }

        if (!password) {
            this.errorEl.textContent = 'Please enter a password.';
            this.passwordInput.focus();
            return;
        }

        this.submitBtn.disabled = true;
        this.submitBtn.textContent = 'Verifying...';
        this.errorEl.textContent = '';

        try {
            const result = await api.post('/auth/verify-password', { username, password });

            if (result.success) {
                // Store token and username
                localStorage.setItem('chamber_token', result.token);
                localStorage.setItem('chamber_username', result.username);

                this.close();
                chamber.enter(result.username);
            } else {
                this.errorEl.textContent = result.message || 'Incorrect password.';
            }
        } catch (error) {
            console.error('Auth error:', error);
            this.errorEl.textContent = 'Connection error. Please try again.';
        } finally {
            this.submitBtn.disabled = false;
            this.submitBtn.textContent = 'Enter';
        }
    },

    /**
     * Check if user has a valid token (auto-login)
     */
    hasValidToken() {
        return !!localStorage.getItem('chamber_token');
    },

    /**
     * Logout — clear stored credentials
     */
    logout() {
        localStorage.removeItem('chamber_token');
        localStorage.removeItem('chamber_username');
    },
};

document.addEventListener('DOMContentLoaded', () => {
    auth.init();
});
