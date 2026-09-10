'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

const { createUserDirectory, createLegacyDirectory } = require('../services/userDirectory');
const { createAuthService } = require('../services/auth.service');

const hash = (plain) => bcrypt.hashSync(plain, 4);

function fakeUserModel(records) {
    return {
        async findOne(query) {
            return records.find((r) => r.username === query.username) || null;
        },
    };
}

const signToken = (payload) => `token:${payload.sub}`;

test('with real identities, one password cannot become the other person', async () => {
    const User = fakeUserModel([
        { _id: 'id-her', username: 'her', passwordHash: hash('her-secret') },
        { _id: 'id-him', username: 'him', passwordHash: hash('his-secret') },
    ]);
    const auth = createAuthService({ users: createUserDirectory(User), signToken });

    assert.equal((await auth.authenticate({ username: 'her', password: 'her-secret' })).ok, true);
    assert.equal(
        (await auth.authenticate({ username: 'him', password: 'her-secret' })).ok,
        false,
        'this is the hole the whole change exists to close'
    );
});

test('the legacy directory keeps the old behaviour exactly', async () => {
    const MasterPassword = { async findOne() { return { passwordHash: hash('the-master') }; } };
    const auth = createAuthService({ users: createLegacyDirectory(MasterPassword), signToken });

    // Deploying without the new environment variables must not change anything
    // for her: same password, same screen, still works.
    assert.equal((await auth.authenticate({ username: 'her', password: 'the-master' })).ok, true);

    // And it keeps the old weakness, which is the point of naming it "legacy".
    assert.equal((await auth.authenticate({ username: 'anyone', password: 'the-master' })).ok, true);
    assert.equal((await auth.authenticate({ username: 'her', password: 'wrong' })).ok, false);
});

test('the legacy directory rejects everyone when no master password is stored', async () => {
    const MasterPassword = { async findOne() { return null; } };
    const auth = createAuthService({ users: createLegacyDirectory(MasterPassword), signToken });

    assert.equal((await auth.authenticate({ username: 'her', password: 'anything' })).ok, false);
});
