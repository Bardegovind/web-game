'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createLettersService } = require('../services/letters.service');

const HER = 'radhe';
const HIM = 'govind';

function fakeLetters(initial) {
    const rows = (initial || []).map((r) => ({ ...r, save: async () => {} }));
    return {
        rows,
        find(query) {
            const matched = rows.filter((r) => !query.writtenFor || r.writtenFor === query.writtenFor);
            return { sort: () => ({ lean: async () => matched }) };
        },
        async findById(id) {
            return rows.find((r) => r._id === id) || null;
        },
        async create(doc) {
            const row = { ...doc, _id: `l${rows.length}`, save: async () => {} };
            rows.push(row);
            return row;
        },
    };
}

const letter = (over) => ({
    _id: 'l1', prompt: 'Open when you miss me', body: 'I miss you too.',
    writtenBy: HIM, writtenFor: HER, openedAt: null, ...over,
});

test('a letter waiting for her is listed without giving away what it says', async () => {
    const letters = createLettersService({ Letter: fakeLetters([letter()]) });

    const waiting = await letters.listFor(HER);

    assert.equal(waiting.length, 1);
    assert.equal(waiting[0].prompt, 'Open when you miss me');
    assert.equal(waiting[0].body, undefined, 'an unopened letter must keep its contents');
    assert.equal(waiting[0].isOpened, false);
});

test('once opened, the letter is listed with what it says', async () => {
    const letters = createLettersService({
        Letter: fakeLetters([letter({ openedAt: new Date(2026, 8, 1) })]),
    });

    const waiting = await letters.listFor(HER);

    assert.equal(waiting[0].isOpened, true);
    assert.equal(waiting[0].body, 'I miss you too.', 'she can read it again afterwards');
});

test('opening a letter returns what it says', async () => {
    const letters = createLettersService({ Letter: fakeLetters([letter()]) });

    const opened = await letters.open({ id: 'l1', username: HER });

    assert.equal(opened.body, 'I miss you too.');
});

/** Part of the point is knowing when she needed it. */
test('opening records the moment, once', async () => {
    const store = fakeLetters([letter()]);
    const first = new Date(2026, 8, 11, 21, 0);
    let clock = first;

    const letters = createLettersService({ Letter: store, now: () => clock });

    await letters.open({ id: 'l1', username: HER });
    assert.deepEqual(store.rows[0].openedAt, first);

    clock = new Date(2026, 8, 12, 9, 0);
    await letters.open({ id: 'l1', username: HER });

    assert.deepEqual(store.rows[0].openedAt, first, 'reading it again does not rewrite the first time');
});

test('the other person cannot open a letter written for her', async () => {
    const letters = createLettersService({ Letter: fakeLetters([letter()]) });

    await assert.rejects(
        () => letters.open({ id: 'l1', username: HIM }),
        'a letter is for one person'
    );
});

test('opening a letter that does not exist fails cleanly', async () => {
    const letters = createLettersService({ Letter: fakeLetters([]) });

    await assert.rejects(() => letters.open({ id: 'nope', username: HER }));
});

test('writing a letter addresses it to the other person', async () => {
    const store = fakeLetters([]);
    const letters = createLettersService({ Letter: store });

    await letters.write({
        prompt: 'Open when you cannot sleep',
        body: 'Count the things we still have to do.',
        writtenBy: HIM,
        writtenFor: HER,
    });

    assert.equal(store.rows.length, 1);
    assert.equal(store.rows[0].writtenFor, HER);
    assert.equal(store.rows[0].openedAt, null, 'a new letter starts unopened');
});

test('a letter needs both a prompt and something to say', async () => {
    const letters = createLettersService({ Letter: fakeLetters([]) });

    await assert.rejects(() => letters.write({ prompt: '', body: 'x', writtenBy: HIM, writtenFor: HER }));
    await assert.rejects(() => letters.write({ prompt: 'x', body: '  ', writtenBy: HIM, writtenFor: HER }));
});

test('how many are still waiting for her', async () => {
    const letters = createLettersService({
        Letter: fakeLetters([
            letter({ _id: 'a' }),
            letter({ _id: 'b' }),
            letter({ _id: 'c', openedAt: new Date() }),
        ]),
    });

    assert.equal(await letters.unopenedCount(HER), 2);
});
