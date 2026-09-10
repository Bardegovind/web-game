'use strict';

const jwt = require('jsonwebtoken');

const User = require('../models/User');
const MasterPassword = require('../models/MasterPassword');
const { createAuthService } = require('../services/auth.service');
const { createRateLimiter } = require('../services/rateLimiter');
const { createUserDirectory, createLegacyDirectory } = require('../services/userDirectory');

const TOKEN_TTL = '24h';

// One limiter for the process. The chamber has exactly one door and a password
// is the only thing guarding it, so unlimited guessing is the entire attack.
const loginLimiter = createRateLimiter();

let authService = null;

/**
 * Chooses how people are identified. Called once at startup with the mode that
 * seeding reported: real per-person accounts, or the legacy shared password.
 */
function configureAuth(mode) {
    const users = mode === 'identities'
        ? createUserDirectory(User)
        : createLegacyDirectory(MasterPassword);

    authService = createAuthService({
        users,
        signToken: (payload) => jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: TOKEN_TTL }),
    });
}

/**
 * POST /api/auth/verify-password
 *
 * Same request and response shape as before, so the login screen is unchanged.
 */
const verifyPassword = async (req, res) => {
    try {
        if (!authService) {
            return res.status(503).json({ success: false, message: 'Server still starting. Try again.' });
        }

        const caller = req.ip || 'unknown';
        const gate = loginLimiter.check(caller);

        if (!gate.allowed) {
            const seconds = Math.ceil(gate.retryAfterMs / 1000);
            res.set('Retry-After', String(seconds));
            return res.status(429).json({
                success: false,
                message: 'Too many attempts. Try again in a few minutes.',
            });
        }

        const result = await authService.authenticate(req.body);

        if (!result.ok) {
            loginLimiter.recordFailure(caller);
            return res.status(401).json({ success: false, message: result.message });
        }

        loginLimiter.recordSuccess(caller);

        return res.status(200).json({
            success: true,
            message: 'Access granted. Welcome to the Secret Chamber.',
            token: result.token,
            username: result.username,
        });
    } catch (error) {
        console.error('Auth Error:', error);
        return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
};

module.exports = { verifyPassword, configureAuth };
