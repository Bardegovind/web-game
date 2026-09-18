'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createRelationshipService } = require('../services/relationship.service');

const HIM = 'govind';

function fakeRelationship(initial) {
    let row = initial ? { ...initial } : null;
    return {
        row(update) {
            if (update) row = update;
            return row;
        },
        findOne() {
            return { lean: async () => (row ? { ...row } : null) };
        },
        async findOneAndUpdate(filter, update) {
            row = { ...(row || {}), ...update };
            return { ...row };
        },
    };
}

function fakeMessages(rows) {
    return {
        findOne() {
            return {
                sort: () => ({
                    select: () => ({
                        lean: async () => {
                            if (!rows || rows.length === 0) return null;
                            const earliest = rows.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
                            return { createdAt: earliest.createdAt };
                        },
                    }),
                }),
            };
        },
    };
}

test('with nothing stored and no messages yet, the start date falls back to today', async () => {
    const clock = new Date(2026, 8, 11);
    const relationship = createRelationshipService({
        Relationship: fakeRelationship(null),
        now: () => clock,
    });

    const { startDate, source } = await relationship.get();

    assert.equal(source, 'today');
    assert.deepEqual(startDate, clock);
});

test('with no stored date, it falls back to the first message they ever exchanged', async () => {
    const firstMessageAt = new Date(2026, 2, 1, 9, 30);
    const relationship = createRelationshipService({
        Relationship: fakeRelationship(null),
        Message: fakeMessages([
            { createdAt: firstMessageAt },
            { createdAt: new Date(2026, 3, 1) },
        ]),
        now: () => new Date(2026, 8, 11),
    });

    const { startDate, source } = await relationship.get();

    assert.equal(source, 'first-message');
    assert.deepEqual(startDate, firstMessageAt);
});

test('once a date is set, that is what comes back — not a fallback', async () => {
    const store = fakeRelationship(null);
    const relationship = createRelationshipService({
        Relationship: store,
        Message: fakeMessages([{ createdAt: new Date(2020, 0, 1) }]),
        now: () => new Date(2026, 8, 11),
    });

    await relationship.set({ date: '2024-06-15', username: HIM });
    const { startDate, source } = await relationship.get();

    assert.equal(source, 'set');
    assert.equal(new Date(startDate).toISOString().slice(0, 10), '2024-06-15');
});

test('setting it twice replaces the one row rather than adding another', async () => {
    const store = fakeRelationship(null);
    const relationship = createRelationshipService({ Relationship: store, now: () => new Date(2026, 8, 11) });

    await relationship.set({ date: '2024-01-01', username: HIM });
    await relationship.set({ date: '2024-06-15', username: 'radhe' });

    assert.equal(store.row().updatedBy, 'radhe');
    assert.equal(new Date(store.row().startDate).toISOString().slice(0, 10), '2024-06-15');
});

test('a date that is not a real date is rejected', async () => {
    const relationship = createRelationshipService({
        Relationship: fakeRelationship(null),
        now: () => new Date(2026, 8, 11),
    });

    await assert.rejects(() => relationship.set({ date: 'not a date', username: HIM }));
    await assert.rejects(() => relationship.set({ date: { $gt: '' }, username: HIM }));
    await assert.rejects(() => relationship.set({ date: undefined, username: HIM }));
});

test('a date in the future is rejected', async () => {
    const relationship = createRelationshipService({
        Relationship: fakeRelationship(null),
        now: () => new Date(2026, 8, 11),
    });

    await assert.rejects(() => relationship.set({ date: '2030-01-01', username: HIM }));
});

test('today itself is accepted, not treated as "the future"', async () => {
    const relationship = createRelationshipService({
        Relationship: fakeRelationship(null),
        now: () => new Date(2026, 8, 11, 22, 0),
    });

    await assert.doesNotReject(() => relationship.set({ date: new Date(2026, 8, 11, 8, 0), username: HIM }));
});

test('days together counts whole calendar days from the start', async () => {
    const store = fakeRelationship({ startDate: new Date(2026, 8, 1), updatedBy: HIM });
    const relationship = createRelationshipService({ Relationship: store, now: () => new Date(2026, 8, 11) });

    assert.equal(await relationship.daysTogether(), 10);
});

test('the next anniversary counts forward from today, not backward', async () => {
    const store = fakeRelationship({ startDate: new Date(2020, 8, 15), updatedBy: HIM });
    const relationship = createRelationshipService({ Relationship: store });

    const result = await relationship.nextAnniversary(new Date(2026, 8, 1));

    assert.equal(result.date.getFullYear(), 2026);
    assert.equal(result.date.getMonth(), 8);
    assert.equal(result.date.getDate(), 15);
    assert.equal(result.daysAway, 14);
    assert.equal(result.yearsCompleted, 6);
});

test('the day of the anniversary itself is zero days away, not rolled to next year', async () => {
    const store = fakeRelationship({ startDate: new Date(2020, 8, 15), updatedBy: HIM });
    const relationship = createRelationshipService({ Relationship: store });

    const result = await relationship.nextAnniversary(new Date(2026, 8, 15));

    assert.equal(result.daysAway, 0);
    assert.equal(result.yearsCompleted, 6);
});

test('the day after the anniversary rolls forward to next year', async () => {
    const store = fakeRelationship({ startDate: new Date(2020, 8, 15), updatedBy: HIM });
    const relationship = createRelationshipService({ Relationship: store });

    const result = await relationship.nextAnniversary(new Date(2026, 8, 16));

    assert.equal(result.date.getFullYear(), 2027);
    assert.equal(result.yearsCompleted, 7);
});

/** A relationship that started on 29 February has no anniversary most years. */
test('a 29 February start falls back to 1 March in a non-leap year', async () => {
    const store = fakeRelationship({ startDate: new Date(2020, 1, 29), updatedBy: HIM });
    const relationship = createRelationshipService({ Relationship: store });

    // 2026 is not a leap year.
    const result = await relationship.nextAnniversary(new Date(2026, 0, 1));

    assert.equal(result.date.getFullYear(), 2026);
    assert.equal(result.date.getMonth(), 2, 'March');
    assert.equal(result.date.getDate(), 1);
});

test('a 29 February start lands on the real day in a leap year', async () => {
    const store = fakeRelationship({ startDate: new Date(2020, 1, 29), updatedBy: HIM });
    const relationship = createRelationshipService({ Relationship: store });

    // 2028 is a leap year.
    const result = await relationship.nextAnniversary(new Date(2028, 0, 1));

    assert.equal(result.date.getMonth(), 1, 'February');
    assert.equal(result.date.getDate(), 29);
});
