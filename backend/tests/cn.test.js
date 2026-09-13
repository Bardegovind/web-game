'use strict';

const { test, before } = require('node:test');
const assert = require('node:assert/strict');

// cn() is TypeScript in the chamber; Node 24 runs it directly.
let cn;

before(async () => {
    ({ cn } = await import('../../frontend/chamber/lib/utils.ts'));
});

test('a later Tailwind class wins over a conflicting earlier one', () => {
    assert.equal(cn('px-2 py-1', 'px-4'), 'py-1 px-4');
});

test('falsy values are dropped', () => {
    assert.equal(cn('a', false, null, undefined, 'b'), 'a b');
});

test('conditional objects are honoured', () => {
    assert.equal(cn('base', { active: true, hidden: false }), 'base active');
});
