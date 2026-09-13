'use strict';

const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let isPeerOnline;

before(async () => {
    ({ isPeerOnline } = await import('../../frontend/chamber/presence/onlineStatus.ts'));
});

const nothingYet = { online: {}, listedOnline: null };

test('with nothing from the socket yet, the stored value is used', () => {
    assert.equal(isPeerOnline('radhe', nothingYet, true), true);
    assert.equal(isPeerOnline('radhe', nothingYet, false), false);
    assert.equal(isPeerOnline('radhe', nothingYet, undefined), false);
});

test("the server's list on connecting beats a stale stored value", () => {
    assert.equal(isPeerOnline('radhe', { online: {}, listedOnline: ['govind'] }, true), false, 'not listed is not here');
    assert.equal(isPeerOnline('radhe', { online: {}, listedOnline: ['radhe', 'govind'] }, false), true);
});

test('a live update beats both, even a live false', () => {
    assert.equal(isPeerOnline('radhe', { online: { radhe: false }, listedOnline: ['radhe'] }, true), false);
    assert.equal(isPeerOnline('radhe', { online: { radhe: true }, listedOnline: [] }, false), true);
});
