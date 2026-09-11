'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { applyReaction, REACTIONS } = require('../services/reactions');

const HER = 'radhe';
const HIM = 'govind';

test('reacting to a message adds it', () => {
    const next = applyReaction([], { username: HER, emoji: '❤️' });

    assert.deepEqual(next, [{ username: HER, emoji: '❤️' }]);
});

test('the same person reacting the same way again takes it back', () => {
    const existing = [{ username: HER, emoji: '❤️' }];

    const next = applyReaction(existing, { username: HER, emoji: '❤️' });

    assert.deepEqual(next, [], 'tapping the same one again should undo it');
});

/** One feeling per person per message — picking another changes your mind. */
test('the same person reacting differently replaces their reaction', () => {
    const existing = [{ username: HER, emoji: '❤️' }];

    const next = applyReaction(existing, { username: HER, emoji: '😂' });

    assert.equal(next.length, 1);
    assert.equal(next[0].emoji, '😂');
});

test('both people can react to the same message', () => {
    const existing = [{ username: HER, emoji: '❤️' }];

    const next = applyReaction(existing, { username: HIM, emoji: '😭' });

    assert.equal(next.length, 2);
    assert.ok(next.some((r) => r.username === HIM && r.emoji === '😭'));
    assert.ok(next.some((r) => r.username === HER && r.emoji === '❤️'));
});

test('one person taking theirs back leaves the other alone', () => {
    const existing = [
        { username: HER, emoji: '❤️' },
        { username: HIM, emoji: '😭' },
    ];

    const next = applyReaction(existing, { username: HER, emoji: '❤️' });

    assert.deepEqual(next, [{ username: HIM, emoji: '😭' }]);
});

test('an emoji outside the offered set is refused', () => {
    assert.throws(() => applyReaction([], { username: HER, emoji: '<script>' }));
});

test('the offered set is small and fixed', () => {
    assert.ok(REACTIONS.length >= 4 && REACTIONS.length <= 8, 'a short row, not a keyboard');
    assert.ok(REACTIONS.includes('❤️'));
});

test('names are normalised so casing cannot double up a reaction', () => {
    const existing = [{ username: HER, emoji: '❤️' }];

    const next = applyReaction(existing, { username: 'Radhe', emoji: '❤️' });

    assert.deepEqual(next, [], 'the same person, however they are capitalised');
});

test('reacting does not mutate what was passed in', () => {
    const existing = [{ username: HER, emoji: '❤️' }];

    applyReaction(existing, { username: HIM, emoji: '😂' });

    assert.equal(existing.length, 1, 'the original array must be left alone');
});
