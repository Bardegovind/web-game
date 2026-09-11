'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createTypingService } = require('../services/typing.service');
const { roomFor } = require('../socket/events');

/** A controllable clock, so a 3s expiry does not cost 3s of test time. */
function fakeTimers() {
    let pending = [];
    let id = 0;
    return {
        setTimeout(fn, ms) { id += 1; pending.push({ id, fn, ms }); return id; },
        clearTimeout(handle) { pending = pending.filter((p) => p.id !== handle); },
        runPending() { const due = pending; pending = []; due.forEach((p) => p.fn()); },
        get count() { return pending.length; },
    };
}

function fakeIo() {
    return {
        emitted: [],
        to(room) {
            const self = this;
            return { emit: (event, payload) => self.emitted.push({ room, event, payload }) };
        },
    };
}

function build() {
    const io = fakeIo();
    const timers = fakeTimers();
    const typing = createTypingService({
        io,
        ttlMs: 3000,
        setTimeout: timers.setTimeout.bind(timers),
        clearTimeout: timers.clearTimeout.bind(timers),
    });
    return { io, timers, typing };
}

test('typing is announced to the other person only', () => {
    const { io, typing } = build();

    typing.start('her', 'him');

    assert.equal(io.emitted.length, 1);
    assert.equal(io.emitted[0].room, roomFor('him'), 'it goes to him, not broadcast');
    assert.equal(io.emitted[0].event, 'typing:start');
    assert.equal(io.emitted[0].payload.sender, 'her');
});

test('stopping is announced', () => {
    const { io, typing } = build();

    typing.start('her', 'him');
    typing.stop('her', 'him');

    assert.equal(io.emitted[1].event, 'typing:stop');
});

/**
 * The indicator that sticks forever. If the stop event is lost — the tab
 * closes, the network drops, the socket dies mid-keystroke — the other person
 * is left looking at "typing..." indefinitely.
 */
test('a lost stop event expires by itself', () => {
    const { io, timers, typing } = build();

    typing.start('her', 'him');
    io.emitted.length = 0;

    timers.runPending();

    assert.equal(io.emitted.length, 1, 'the server should stop it on her behalf');
    assert.equal(io.emitted[0].event, 'typing:stop');
    assert.equal(io.emitted[0].payload.sender, 'her');
});

test('continuing to type pushes the expiry back', () => {
    const { io, timers, typing } = build();

    typing.start('her', 'him');
    typing.start('her', 'him');
    typing.start('her', 'him');

    assert.equal(timers.count, 1, 'there should only ever be one pending expiry per conversation');

    io.emitted.length = 0;
    timers.runPending();
    assert.equal(io.emitted.length, 1, 'and it should fire once, not three times');
});

test('an explicit stop cancels the expiry so it does not fire twice', () => {
    const { io, timers, typing } = build();

    typing.start('her', 'him');
    typing.stop('her', 'him');
    io.emitted.length = 0;

    timers.runPending();

    assert.equal(io.emitted.length, 0, 'the timer should have been cleared');
});

test('two conversations are tracked independently', () => {
    const { io, typing } = build();

    typing.start('her', 'him');
    typing.start('her', 'someone');
    io.emitted.length = 0;

    typing.stop('her', 'him');

    assert.equal(io.emitted.length, 1);
    assert.equal(io.emitted[0].room, roomFor('him'), 'stopping one must not stop the other');
});

test('names are normalised so casing cannot split the state', () => {
    const { io, typing } = build();

    typing.start('Her', 'HIM');

    assert.equal(io.emitted[0].room, roomFor('him'));
    assert.equal(io.emitted[0].payload.sender, 'her');
});
