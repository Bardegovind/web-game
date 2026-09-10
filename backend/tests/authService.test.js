'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

const { createAuthService } = require('../services/auth.service');

const HER = 'her';
const HIS = 'him';

/**
 * A stand-in for the users collection. Real bcrypt hashes, low cost so the
 * suite stays fast — the point is to prove the comparison is per-user.
 */
function fakeUsers(records) {
    return {
        async findByUsername(username) {
            return records.find((r) => r.username === String(username).toLowerCase()) || null;
        },
    };
}

function hash(plain) {
    return bcrypt.hashSync(plain, 4);
}

function buildService(overrides) {
    const options = overrides || {};
    return createAuthService({
        users: options.users || fakeUsers([
            { _id: 'id-her', username: HER, passwordHash: hash('her-secret') },
            { _id: 'id-him', username: HIS, passwordHash: hash('his-secret') },
        ]),
        signToken: options.signToken || ((payload) => `token:${payload.sub}:${payload.username}`),
        ...options,
    });
}

test('the right password for a user signs them in', async () => {
    const auth = buildService();

    const result = await auth.authenticate({ username: HER, password: 'her-secret' });

    assert.equal(result.ok, true);
    assert.equal(result.username, HER);
    assert.equal(result.token, 'token:id-her:her');
});

test('one password does not unlock the other person', async () => {
    const auth = buildService();

    // This is the impersonation hole: knowing one password used to be enough
    // to log in under any name at all.
    const result = await auth.authenticate({ username: HIS, password: 'her-secret' });

    assert.equal(result.ok, false, 'her password must not sign anyone in as him');
    assert.equal(result.token, undefined);
});

test('an unknown username is rejected', async () => {
    const auth = buildService();

    const result = await auth.authenticate({ username: 'stranger', password: 'her-secret' });

    assert.equal(result.ok, false);
});

test('a rejected login says nothing about which part was wrong', async () => {
    const auth = buildService();

    const unknownUser = await auth.authenticate({ username: 'stranger', password: 'her-secret' });
    const wrongPassword = await auth.authenticate({ username: HER, password: 'not-it' });

    assert.equal(
        unknownUser.message,
        wrongPassword.message,
        'the two failures must be indistinguishable, or the form enumerates usernames'
    );
});

test('usernames are matched case-insensitively', async () => {
    const auth = buildService();

    const result = await auth.authenticate({ username: 'HER', password: 'her-secret' });

    assert.equal(result.ok, true, 'she should not be locked out by capitalisation');
    assert.equal(result.username, HER, 'the canonical lowercase name is what gets stored');
});

test('the token carries the user id, not just the name they typed', async () => {
    const captured = [];
    const auth = buildService({
        signToken: (payload) => {
            captured.push(payload);
            return 'token';
        },
    });

    await auth.authenticate({ username: HER, password: 'her-secret' });

    assert.equal(captured.length, 1);
    assert.equal(captured[0].sub, 'id-her', 'downstream code must key off an id it can trust');
    assert.equal(captured[0].username, HER);
});

test('a missing username or password is rejected without touching the database', async () => {
    let lookups = 0;
    const auth = buildService({
        users: {
            async findByUsername() {
                lookups += 1;
                return null;
            },
        },
    });

    assert.equal((await auth.authenticate({ username: '', password: 'x' })).ok, false);
    assert.equal((await auth.authenticate({ username: HER, password: '' })).ok, false);
    assert.equal(lookups, 0, 'empty credentials should short-circuit');
});

test('a non-string password is rejected rather than throwing', async () => {
    const auth = buildService();

    // req.body.password can be anything a client sends, including an object.
    const result = await auth.authenticate({ username: HER, password: { $ne: null } });

    assert.equal(result.ok, false, 'a junk password must fail cleanly, not crash the endpoint');
});
