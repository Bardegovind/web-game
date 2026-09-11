'use strict';

const bcrypt = require('bcryptjs');

const BCRYPT_COST = 12;

/**
 * The original shared password.
 *
 * Kept because it is still the fallback when per-user accounts are not
 * configured — removing it would lock out an unconfigured deploy. Once
 * USER_A_NAME and USER_B_NAME are set this record is no longer consulted.
 */
async function seedMasterPassword(deps) {
    const { MasterPassword, env, log } = deps;
    const plain = env.MASTER_PASSWORD;

    if (!plain) {
        log('🔐 No MASTER_PASSWORD set; relying on per-user accounts.');
        return { seeded: false };
    }

    const existing = await MasterPassword.findOne();

    if (!existing) {
        const hash = await bcrypt.hash(plain, BCRYPT_COST);
        await MasterPassword.create({ passwordHash: hash });
        log('🔐 Master password hashed and stored.');
        return { seeded: true, created: true };
    }

    if (await bcrypt.compare(plain, existing.passwordHash)) {
        log('🔐 Master password is up to date.');
        return { seeded: true, changed: false };
    }

    existing.passwordHash = await bcrypt.hash(plain, BCRYPT_COST);
    await existing.save();
    log('🔐 Master password updated to match the environment.');
    return { seeded: true, changed: true };
};

module.exports = { seedMasterPassword };
