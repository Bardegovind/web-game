'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createNudgesService } = require('../services/nudges.service');

const HER = 'radhe';
const HIM = 'govind';

function fakeNudges(initial) {
    const rows = (initial || []).map((r) => ({ ...r }));
    let counter = rows.length;
    return {
        rows,
        findOne(query) {
            return {
                sort: () => ({
                    lean: async () => {
                        const matched = rows.filter((r) => !query.from || r.from === query.from);
                        if (matched.length === 0) return null;
                        return matched.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
                    },
                }),
            };
        },
        find(query) {
            const matched = rows.filter((r) =>
                (!query.to || r.to === query.to)
                && !('seenAt' in query && query.seenAt !== undefined && r.seenAt !== query.seenAt));
            return {
                sort: () => ({ lean: async () => [...matched].sort((a, b) => b.createdAt - a.createdAt) }),
            };
        },
        async create(doc) {
            const row = { _id: `n${counter++}`, ...doc };
            rows.push(row);
            return row;
        },
        async updateMany(query, update) {
            const matched = rows.filter((r) =>
                (!query.to || r.to === query.to)
                && !('seenAt' in query && query.seenAt !== undefined && r.seenAt !== query.seenAt));
            for (const r of matched) Object.assign(r, update.$set);
            return { modifiedCount: matched.length };
        },
    };
}

function build(overrides) {
    const clock = { now: new Date(2026, 8, 11, 12, 0, 0) };
    const store = fakeNudges(overrides && overrides.initial);
    const nudges = createNudgesService({ Nudge: store, now: () => clock.now });
    return { nudges, store, clock };
}

test('a tap sends a nudge to the other person', async () => {
    const { nudges, store } = build();

    const result = await nudges.send({ from: HIM, to: HER });

    assert.equal(result.sent, true);
    assert.equal(store.rows.length, 1);
    assert.equal(store.rows[0].from, HIM);
    assert.equal(store.rows[0].to, HER);
    assert.equal(store.rows[0].seenAt, null);
});

test('a second tap within 60 seconds is refused rather than thrown', async () => {
    const { nudges, clock } = build();

    await nudges.send({ from: HIM, to: HER });

    clock.now = new Date(clock.now.getTime() + 30_000);
    const result = await nudges.send({ from: HIM, to: HER });

    assert.equal(result.sent, false);
    assert.equal(result.reason, 'too-soon');
});

test('a tap 60 seconds later is allowed again', async () => {
    const { nudges, store, clock } = build();

    await nudges.send({ from: HIM, to: HER });

    clock.now = new Date(clock.now.getTime() + 60_000);
    const result = await nudges.send({ from: HIM, to: HER });

    assert.equal(result.sent, true);
    assert.equal(store.rows.length, 2);
});

test('the cooldown is per sender, not shared between the two of them', async () => {
    const { nudges, clock } = build();

    await nudges.send({ from: HIM, to: HER });

    clock.now = new Date(clock.now.getTime() + 1000);
    const hers = await nudges.send({ from: HER, to: HIM });

    assert.equal(hers.sent, true, 'her own cooldown has nothing to do with his');
});

test('pending returns what is waiting for them, newest first', async () => {
    const { nudges } = build({
        initial: [
            { _id: 'n1', from: HIM, to: HER, seenAt: null, createdAt: new Date(2026, 8, 1) },
            { _id: 'n2', from: HIM, to: HER, seenAt: null, createdAt: new Date(2026, 8, 5) },
            { _id: 'n3', from: HER, to: HIM, seenAt: null, createdAt: new Date(2026, 8, 6) },
        ],
    });

    const waiting = await nudges.pending({ username: HER });

    assert.equal(waiting.length, 2);
    assert.equal(waiting[0]._id, 'n2', 'newest first');
});

test('a nudge already seen does not show up as pending', async () => {
    const { nudges } = build({
        initial: [
            { _id: 'n1', from: HIM, to: HER, seenAt: new Date(2026, 8, 2), createdAt: new Date(2026, 8, 1) },
        ],
    });

    assert.equal((await nudges.pending({ username: HER })).length, 0);
});

test('marking seen clears everything waiting and says how many', async () => {
    const { nudges } = build({
        initial: [
            { _id: 'n1', from: HIM, to: HER, seenAt: null, createdAt: new Date(2026, 8, 1) },
            { _id: 'n2', from: HIM, to: HER, seenAt: null, createdAt: new Date(2026, 8, 2) },
        ],
    });

    const count = await nudges.markSeen({ username: HER });
    assert.equal(count, 2);

    assert.equal((await nudges.pending({ username: HER })).length, 0);
});

test('marking seen with nothing pending returns zero', async () => {
    const { nudges } = build();

    assert.equal(await nudges.markSeen({ username: HER }), 0);
});
