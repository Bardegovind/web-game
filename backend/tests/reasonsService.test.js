'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createReasonsService } = require('../services/reasons.service');

const HER = 'radhe';
const HIM = 'govind';

function fakeReasons(initial) {
    const rows = (initial || []).map((r) => ({ ...r }));
    let counter = rows.length;
    return {
        rows,
        find() {
            return {
                sort: () => ({
                    lean: async () => [...rows].sort((a, b) => b.createdAt - a.createdAt),
                }),
            };
        },
        async findById(id) {
            return rows.find((r) => r._id === id) || null;
        },
        async create(doc) {
            const row = { _id: `r${counter++}`, createdAt: new Date(2026, 8, 11, 0, counter), ...doc };
            rows.push(row);
            return row;
        },
        async deleteOne({ _id }) {
            const index = rows.findIndex((r) => r._id === _id);
            if (index >= 0) rows.splice(index, 1);
        },
    };
}

const row = (over) => ({
    _id: 'r1', text: 'the way you laugh at your own jokes first', author: HIM,
    createdAt: new Date(2026, 8, 1), ...over,
});

test('the jar lists newest first', async () => {
    const reasons = createReasonsService({
        Reason: fakeReasons([
            row({ _id: 'a', text: 'first', createdAt: new Date(2026, 8, 1) }),
            row({ _id: 'b', text: 'second', createdAt: new Date(2026, 8, 3) }),
        ]),
    });

    const list = await reasons.list();

    assert.equal(list[0].text, 'second');
    assert.equal(list[1].text, 'first');
});

test('adding one trims it and records who wrote it', async () => {
    const store = fakeReasons([]);
    const reasons = createReasonsService({ Reason: store });

    await reasons.add({ text: '  you make terrible tea and I love it  ', author: HER });

    assert.equal(store.rows.length, 1);
    assert.equal(store.rows[0].text, 'you make terrible tea and I love it');
    assert.equal(store.rows[0].author, HER);
});

test('an empty reason is refused', async () => {
    const reasons = createReasonsService({ Reason: fakeReasons([]) });

    await assert.rejects(() => reasons.add({ text: '', author: HER }));
    await assert.rejects(() => reasons.add({ text: '    ', author: HER }));
});

test('a reason longer than 200 characters is refused', async () => {
    const reasons = createReasonsService({ Reason: fakeReasons([]) });
    const tooLong = 'x'.repeat(201);
    const justRight = 'x'.repeat(200);

    await assert.rejects(() => reasons.add({ text: tooLong, author: HER }));
    await assert.doesNotReject(() => reasons.add({ text: justRight, author: HER }));
});

test('only whoever wrote it can take it out of the jar', async () => {
    const store = fakeReasons([row({ _id: 'r1', author: HIM })]);
    const reasons = createReasonsService({ Reason: store });

    await assert.rejects(() => reasons.remove({ id: 'r1', author: HER }));
    assert.equal(store.rows.length, 1, 'the reason must still be there');

    await reasons.remove({ id: 'r1', author: HIM });
    assert.equal(store.rows.length, 0);
});

test('removing a reason that is not there fails cleanly', async () => {
    const reasons = createReasonsService({ Reason: fakeReasons([]) });

    await assert.rejects(() => reasons.remove({ id: 'nope', author: HER }));
});

test('the reason of the day is the same one for both people on the same day', async () => {
    const store = fakeReasons(
        Array.from({ length: 8 }, (_, i) => row({ _id: `r${i}`, text: `reason ${i}` }))
    );
    const reasons = createReasonsService({ Reason: store });
    const day = new Date(2026, 8, 11);

    const hers = await reasons.ofTheDay({ date: day });
    const his = await reasons.ofTheDay({ date: day });

    assert.equal(hers.text, his.text);
});

test('a different day may pick a different reason', async () => {
    const store = fakeReasons(
        Array.from({ length: 8 }, (_, i) => row({ _id: `r${i}`, text: `reason ${i}` }))
    );
    const reasons = createReasonsService({ Reason: store });

    const days = [
        new Date(2026, 8, 11), new Date(2026, 8, 12), new Date(2026, 8, 13),
        new Date(2026, 8, 14), new Date(2026, 8, 15),
    ];
    const picks = new Set();
    for (const day of days) {
        picks.add((await reasons.ofTheDay({ date: day })).text);
    }

    assert.ok(picks.size > 1, 'it should not be the same reason every day');
});

test('an empty jar has no reason of the day', async () => {
    const reasons = createReasonsService({ Reason: fakeReasons([]) });

    assert.equal(await reasons.ofTheDay({ date: new Date(2026, 8, 11) }), null);
});
