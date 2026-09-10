'use strict';

const bcrypt = require('bcryptjs');

/**
 * Auth service — resolves who someone actually is.
 *
 * The password proves identity here. It no longer merely proves that the person
 * is allowed in, with the name left to whatever they typed. Two people, two
 * passwords, so knowing one is not enough to become the other.
 */

// Every rejection returns this, whatever went wrong. A message that distinguishes
// "no such user" from "wrong password" hands an attacker a username oracle.
const REJECTION = 'Incorrect username or password.';

// Compared against when no user matched, so a miss costs the same time as a hit
// and the response time cannot be used to enumerate who exists.
const DECOY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEe.9ZuFOtPnEIXpQNZ5.7z7yTQ0KKlUxOu';

function createAuthService(deps) {
    const options = deps || {};
    const users = options.users;
    const signToken = options.signToken;
    const compare = options.compare || bcrypt.compare.bind(bcrypt);

    function reject() {
        return { ok: false, message: REJECTION };
    }

    async function authenticate(credentials) {
        const input = credentials || {};

        // Anything can arrive in a request body, including objects intended to
        // reach the query layer. Only strings get past here.
        if (typeof input.username !== 'string' || typeof input.password !== 'string') {
            return reject();
        }

        const username = input.username.trim().toLowerCase();
        const password = input.password;

        if (!username || !password) {
            return reject();
        }

        const user = await users.findByUsername(username);

        if (!user) {
            await compare(password, DECOY_HASH);
            return reject();
        }

        const matches = await compare(password, user.passwordHash);

        if (!matches) {
            return reject();
        }

        return {
            ok: true,
            username: user.username,
            token: signToken({ sub: String(user._id), username: user.username }),
        };
    }

    return { authenticate };
}

module.exports = { createAuthService, REJECTION };
