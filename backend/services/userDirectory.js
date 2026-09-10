'use strict';

/**
 * Where the auth service looks people up.
 *
 * Two implementations, one interface. Which one is in play decides whether the
 * app has real identities or the old shared-password behaviour — the auth
 * service itself never knows the difference, so both paths get the same
 * validation, the same timing defence and the same tests.
 */

/** Real identities: each person has their own password. */
function createUserDirectory(User) {
    return {
        async findByUsername(username) {
            return User.findOne({ username });
        },
    };
}

/**
 * Legacy: one shared password, and the username is whatever was typed.
 *
 * This is the impersonation hole, kept deliberately so that deploying the new
 * code without the new environment variables changes nothing for anyone who is
 * already using the app. It stops being reachable the moment USER_A_NAME and
 * USER_B_NAME are set.
 */
function createLegacyDirectory(MasterPassword) {
    return {
        async findByUsername(username) {
            const record = await MasterPassword.findOne();
            if (!record) return null;

            return {
                _id: username,
                username: username,
                passwordHash: record.passwordHash,
            };
        },
    };
}

module.exports = { createUserDirectory, createLegacyDirectory };
