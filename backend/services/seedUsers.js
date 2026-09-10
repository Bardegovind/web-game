'use strict';

const bcrypt = require('bcryptjs');

const BCRYPT_COST = 12;

/**
 * Seeds the two people from the environment.
 *
 * Returns the mode the app should run in. If the new variables are absent it
 * reports 'legacy' and the caller keeps the old shared-password path, so
 * deploying this code without configuring anything changes nothing for anyone
 * who is mid-conversation.
 *
 * Set USER_A_PASSWORD to the value MASTER_PASSWORD has today and her login is
 * byte-identical to what she already types.
 */
async function seedUsers(deps) {
    const { User, env, log } = deps;

    const people = [
        { username: env.USER_A_NAME, password: env.USER_A_PASSWORD },
        { username: env.USER_B_NAME, password: env.USER_B_PASSWORD },
    ].filter((p) => p.username && p.password);

    if (people.length === 0) {
        log('🔑 No per-user credentials configured — using the shared master password.');
        return { mode: 'legacy', seeded: 0 };
    }

    for (const person of people) {
        const username = String(person.username).trim().toLowerCase();
        const existing = await User.findOne({ username });

        if (!existing) {
            const hash = await bcrypt.hash(person.password, BCRYPT_COST);
            await User.create({ username, passwordHash: hash });
            log(`🔑 Created account for @${username}.`);
            continue;
        }

        const unchanged = await bcrypt.compare(person.password, existing.passwordHash);
        if (unchanged) continue;

        existing.passwordHash = await bcrypt.hash(person.password, BCRYPT_COST);
        await existing.save();
        log(`🔑 Updated the password for @${username}.`);
    }

    return { mode: 'identities', seeded: people.length };
}

module.exports = { seedUsers };
