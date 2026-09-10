'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

const { seedUsers } = require('../services/seedUsers');

const silent = () => {};

function fakeUserModel(initial) {
    const records = initial ? initial.slice() : [];
    return {
        records,
        async findOne(query) {
            return records.find((r) => r.username === query.username) || null;
        },
        async create(doc) {
            records.push({ ...doc, save: async () => {} });
            return doc;
        },
    };
}

test('with no credentials configured the app stays on the legacy path', async () => {
    const User = fakeUserModel();

    const result = await seedUsers({ User, env: {}, log: silent });

    assert.equal(result.mode, 'legacy', 'an unconfigured deploy must not change how anyone signs in');
    assert.equal(User.records.length, 0);
});

test('a half-configured person is ignored rather than half-created', async () => {
    const User = fakeUserModel();

    const result = await seedUsers({ User, env: { USER_A_NAME: 'her' }, log: silent });

    assert.equal(result.mode, 'legacy', 'a name without a password is not an account');
    assert.equal(User.records.length, 0);
});

test('both people are created when configured', async () => {
    const User = fakeUserModel();

    const result = await seedUsers({
        User,
        env: {
            USER_A_NAME: 'Her', USER_A_PASSWORD: 'her-secret',
            USER_B_NAME: 'Him', USER_B_PASSWORD: 'his-secret',
        },
        log: silent,
    });

    assert.equal(result.mode, 'identities');
    assert.deepEqual(User.records.map((r) => r.username), ['her', 'him'], 'names are normalised');
    assert.ok(await bcrypt.compare('her-secret', User.records[0].passwordHash));
    assert.equal(User.records[0].passwordHash.startsWith('$2'), true, 'stored hashed, never plain');
});

test('re-running with the same password does not rewrite the hash', async () => {
    const originalHash = bcrypt.hashSync('her-secret', 4);
    let saved = false;
    const User = fakeUserModel([
        { username: 'her', passwordHash: originalHash, save: async () => { saved = true; } },
    ]);

    await seedUsers({ User, env: { USER_A_NAME: 'her', USER_A_PASSWORD: 'her-secret' }, log: silent });

    assert.equal(saved, false, 'an unchanged password should be left alone on every restart');
    assert.equal(User.records[0].passwordHash, originalHash);
});

test('changing the password in the environment updates the stored hash', async () => {
    let saved = false;
    const User = fakeUserModel([
        { username: 'her', passwordHash: bcrypt.hashSync('old-secret', 4), save: async () => { saved = true; } },
    ]);

    await seedUsers({ User, env: { USER_A_NAME: 'her', USER_A_PASSWORD: 'new-secret' }, log: silent });

    assert.equal(saved, true);
    assert.ok(await bcrypt.compare('new-secret', User.records[0].passwordHash));
});
