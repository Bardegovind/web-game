'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createNotifier } = require('../services/notifier');

function fakeSubscriptions() {
    const rows = [];
    return {
        rows,
        async findOneAndUpdate(query, update) {
            const existing = rows.find((r) => r.endpoint === query.endpoint);
            if (existing) { Object.assign(existing, update.$set); return existing; }
            rows.push({ ...update.$set });
            return rows[rows.length - 1];
        },
        async deleteOne(query) {
            const i = rows.findIndex((r) => r.endpoint === query.endpoint);
            if (i !== -1) rows.splice(i, 1);
        },
        find(query) {
            return { lean: async () => rows.filter((r) => r.username === query.username) };
        },
    };
}

const subscription = (endpoint) => ({
    endpoint,
    keys: { p256dh: 'a-public-key', auth: 'an-auth-secret' },
});

test('a device is remembered so it can be reached later', async () => {
    const store = fakeSubscriptions();
    const notifier = createNotifier({ PushSubscription: store });

    await notifier.subscribe({ username: 'radhe', subscription: subscription('https://push/1') });

    assert.equal(store.rows.length, 1);
    assert.equal(store.rows[0].username, 'radhe');
});

test('re-subscribing the same device replaces rather than duplicates', async () => {
    const store = fakeSubscriptions();
    const notifier = createNotifier({ PushSubscription: store });

    await notifier.subscribe({ username: 'radhe', subscription: subscription('https://push/1') });
    await notifier.subscribe({ username: 'radhe', subscription: subscription('https://push/1') });

    assert.equal(store.rows.length, 1, 'the endpoint is the device');
});

test('her phone and her laptop are both remembered', async () => {
    const store = fakeSubscriptions();
    const notifier = createNotifier({ PushSubscription: store });

    await notifier.subscribe({ username: 'radhe', subscription: subscription('https://push/phone') });
    await notifier.subscribe({ username: 'radhe', subscription: subscription('https://push/laptop') });

    assert.equal(store.rows.length, 2);
});

test('a malformed subscription is refused', async () => {
    const notifier = createNotifier({ PushSubscription: fakeSubscriptions() });

    await assert.rejects(() => notifier.subscribe({ username: 'radhe', subscription: {} }));
});

test('unsubscribing forgets the device', async () => {
    const store = fakeSubscriptions();
    const notifier = createNotifier({ PushSubscription: store });

    await notifier.subscribe({ username: 'radhe', subscription: subscription('https://push/1') });
    await notifier.unsubscribe('https://push/1');

    assert.equal(store.rows.length, 0);
});

test('without keys it is inert rather than pretending to deliver', async () => {
    const notifier = createNotifier({ PushSubscription: fakeSubscriptions() });

    const result = await notifier.notify({ username: 'radhe' });

    assert.equal(result.configured, false);
    assert.equal(result.sent, 0);
});

/**
 * A notification is read on a lock screen, in front of whoever happens to be
 * nearby. It must never say what is waiting, or who it is from.
 */
test('a notification gives nothing away', async () => {
    const notifier = createNotifier({
        PushSubscription: fakeSubscriptions(),
        publicKey: 'pub', privateKey: 'priv',
    });

    const { payload } = await notifier.notify({ username: 'radhe' });

    assert.equal(payload.title, 'Tic Tac Toe', 'it looks like the game');
    assert.ok(!/chamber|letter|message|radhe|govind/i.test(JSON.stringify(payload)));
});

test('with keys it reports how many devices it would reach', async () => {
    const store = fakeSubscriptions();
    const notifier = createNotifier({
        PushSubscription: store, publicKey: 'pub', privateKey: 'priv',
    });

    await notifier.subscribe({ username: 'radhe', subscription: subscription('https://push/1') });
    const result = await notifier.notify({ username: 'radhe' });

    assert.equal(result.configured, true);
    assert.equal(result.targets, 1);
});
