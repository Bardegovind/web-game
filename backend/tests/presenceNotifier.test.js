'use strict';

const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let createPresenceNotifier;
let LEFT_GRACE_MS;

before(async () => {
    ({ createPresenceNotifier, LEFT_GRACE_MS } = await import('../../frontend/chamber/presence/presenceNotifier.ts'));
});

/** A clock the test moves by hand, so a five second grace costs no real time. */
function fakeClock() {
    let now = 0;
    let nextId = 1;
    const timers = new Map();
    return {
        schedule: (callback, ms) => {
            const id = nextId++;
            timers.set(id, { at: now + ms, callback });
            return id;
        },
        cancel: (id) => {
            timers.delete(id);
        },
        advance(ms) {
            now += ms;
            for (const [id, timer] of [...timers]) {
                if (timer.at <= now) {
                    timers.delete(id);
                    timer.callback();
                }
            }
        },
    };
}

function setup() {
    const clock = fakeClock();
    const notices = [];
    const notifier = createPresenceNotifier({
        me: 'govind',
        notify: (notice) => notices.push(notice),
        schedule: clock.schedule,
        cancel: clock.cancel,
    });
    return { clock, notices, notifier };
}

const online = (username) => ({ username, isOnline: true });
const offline = (username) => ({ username, isOnline: false });

test('the grace period before announcing a departure is five seconds', () => {
    assert.equal(LEFT_GRACE_MS, 5000);
});

test('someone arriving is announced', () => {
    const { notifier, notices } = setup();

    notifier.handle(online('radhe'));

    assert.deepEqual(notices, [{ kind: 'arrived', username: 'radhe' }]);
});

test('your own arrival is never announced, however it is capitalised', () => {
    const { notifier, notices } = setup();

    notifier.handle(online('govind'));
    notifier.handle(online('Govind'));

    assert.deepEqual(notices, []);
});

test('a second tab does not announce them twice', () => {
    const { notifier, notices } = setup();

    notifier.handle(online('radhe'));
    notifier.handle(online('radhe'));

    assert.equal(notices.length, 1, 'the server sends "online" once per connection');
});

test('someone already here when you entered is not announced when they open another tab', () => {
    const { notifier, notices } = setup();

    notifier.seed([online('radhe')]);
    notifier.handle(online('radhe'));

    assert.deepEqual(notices, []);
});

test('leaving is announced only once the grace period has passed', () => {
    const { notifier, notices, clock } = setup();

    notifier.seed([online('radhe')]);
    notifier.handle(offline('radhe'));

    clock.advance(4999);
    assert.deepEqual(notices, [], 'not before five seconds');

    clock.advance(1);
    assert.deepEqual(notices, [{ kind: 'left', username: 'radhe' }]);
});

test('coming back inside the grace period announces nothing at all', () => {
    const { notifier, notices, clock } = setup();

    notifier.seed([online('radhe')]);
    notifier.handle(offline('radhe'));
    clock.advance(2000);
    notifier.handle(online('radhe'));
    clock.advance(10000);

    assert.deepEqual(notices, [], 'a quick app switch must not flash "left" then "is here"');
});

test('coming back after being announced as gone is announced again', () => {
    const { notifier, notices, clock } = setup();

    notifier.seed([online('radhe')]);
    notifier.handle(offline('radhe'));
    clock.advance(5000);
    notifier.handle(online('radhe'));

    assert.deepEqual(notices, [
        { kind: 'left', username: 'radhe' },
        { kind: 'arrived', username: 'radhe' },
    ]);
});

test('someone never seen online going offline is not announced', () => {
    const { notifier, notices, clock } = setup();

    notifier.handle(offline('radhe'));
    clock.advance(10000);

    assert.deepEqual(notices, []);
});

test('a repeated offline during the grace period does not announce twice', () => {
    const { notifier, notices, clock } = setup();

    notifier.seed([online('radhe')]);
    notifier.handle(offline('radhe'));
    notifier.handle(offline('radhe'));
    clock.advance(10000);

    assert.equal(notices.length, 1);
});

test('seeding never overrides what a live event already said', () => {
    const { notifier, notices } = setup();

    notifier.handle(offline('radhe'));       // live: she is offline
    notifier.seed([online('radhe')]);        // a stale list says online
    notifier.handle(online('radhe'));        // she really arrives

    assert.deepEqual(notices, [{ kind: 'arrived', username: 'radhe' }]);
});

test('dispose cancels a departure that was still waiting', () => {
    const { notifier, notices, clock } = setup();

    notifier.seed([online('radhe')]);
    notifier.handle(offline('radhe'));
    notifier.dispose();
    clock.advance(10000);

    assert.deepEqual(notices, []);
});

test('names are compared without regard to capitals', () => {
    const { notifier, notices } = setup();

    notifier.handle(online('Radhe'));
    notifier.handle(online('radhe'));

    assert.deepEqual(notices, [{ kind: 'arrived', username: 'radhe' }]);
});
