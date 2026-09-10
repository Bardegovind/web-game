'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createTapSequence } = require('../../frontend/js/tapSequence.js');

// The ritual is frozen: zone 1 x16, then zone 2 x3, then zone 3 x7.
const ZONE_1 = 1;
const ZONE_2 = 2;
const ZONE_3 = 3;

/**
 * Taps a zone `times` times, spacing taps 100ms apart so the debounce
 * never rejects a deliberate tap. Returns the final result.
 */
function tapMany(seq, zone, times, clock) {
    let result;
    for (let i = 0; i < times; i++) {
        clock.now += 100;
        result = seq.tap(zone, clock.now);
    }
    return result;
}

function newClock() {
    return { now: 1_000_000 };
}

test('the full 16 / 3 / 7 sequence unlocks', () => {
    const seq = createTapSequence();
    const clock = newClock();

    tapMany(seq, ZONE_1, 16, clock);
    tapMany(seq, ZONE_2, 3, clock);
    const result = tapMany(seq, ZONE_3, 7, clock);

    assert.equal(result.unlocked, true, 'the 7th tap on zone 3 should unlock');
    assert.equal(seq.state, 'UNLOCKED');
});

test('the sequence does not unlock one tap early', () => {
    const seq = createTapSequence();
    const clock = newClock();

    tapMany(seq, ZONE_1, 16, clock);
    tapMany(seq, ZONE_2, 3, clock);
    const result = tapMany(seq, ZONE_3, 6, clock);

    assert.equal(result.unlocked, false, '6 taps on zone 3 is not enough');
    assert.notEqual(seq.state, 'UNLOCKED');
});

test('tapping the wrong corner resets progress', () => {
    const seq = createTapSequence();
    const clock = newClock();

    tapMany(seq, ZONE_1, 5, clock);
    clock.now += 100;
    const result = seq.tap(ZONE_2, clock.now);

    assert.equal(result.reset, true, 'a wrong corner should reset');
    assert.equal(seq.state, 'IDLE');
});

test('a 17th tap on zone 1 resets, because zone 1 is no longer expected', () => {
    const seq = createTapSequence();
    const clock = newClock();

    tapMany(seq, ZONE_1, 16, clock);
    clock.now += 100;
    const result = seq.tap(ZONE_1, clock.now);

    assert.equal(result.reset, true);
    assert.equal(seq.state, 'IDLE');
});

test('a tap outside every zone is ignored, not treated as a reset', () => {
    const seq = createTapSequence();
    const clock = newClock();

    tapMany(seq, ZONE_1, 10, clock);
    clock.now += 100;
    const stray = seq.tap(99, clock.now);

    assert.equal(stray.ignored, true, 'a stray tap should be ignored');
    assert.equal(stray.reset, undefined, 'a stray tap must not reset her progress');

    // Progress survived: 6 more on zone 1 still completes the first step.
    tapMany(seq, ZONE_1, 6, clock);
    tapMany(seq, ZONE_2, 3, clock);
    const result = tapMany(seq, ZONE_3, 7, clock);

    assert.equal(result.unlocked, true, 'the stray tap should not have cost her the run');
});

test('once unlocked, further taps do nothing', () => {
    const seq = createTapSequence();
    const clock = newClock();

    tapMany(seq, ZONE_1, 16, clock);
    tapMany(seq, ZONE_2, 3, clock);
    tapMany(seq, ZONE_3, 7, clock);

    clock.now += 100;
    const after = seq.tap(ZONE_1, clock.now);

    assert.equal(after.unlocked, false, 'the sequence must not re-fire');
    assert.equal(after.ignored, true);
    assert.equal(seq.state, 'UNLOCKED');
});

test('reset() clears progress and re-arms from IDLE', () => {
    const seq = createTapSequence();
    const clock = newClock();

    tapMany(seq, ZONE_1, 16, clock);
    tapMany(seq, ZONE_2, 3, clock);
    tapMany(seq, ZONE_3, 7, clock);
    assert.equal(seq.state, 'UNLOCKED');

    seq.reset();
    assert.equal(seq.state, 'IDLE');

    tapMany(seq, ZONE_1, 16, clock);
    tapMany(seq, ZONE_2, 3, clock);
    const again = tapMany(seq, ZONE_3, 7, clock);
    assert.equal(again.unlocked, true, 'after reset the ritual works again');
});

test('two taps inside the debounce window count as one when it is enabled', () => {
    const seq = createTapSequence({ debounceMs: 30 });
    const clock = newClock();

    clock.now += 100;
    seq.tap(ZONE_1, clock.now);

    // A duplicate event 5ms later — one physical tap reported twice.
    const ghost = seq.tap(ZONE_1, clock.now + 5);

    assert.equal(ghost.ignored, true, 'the ghost tap should be swallowed');
    assert.equal(ghost.progressed, undefined, 'it must not advance the count');
});

// Measured from a real browser: taps arrived 16-34ms apart with no duplicates.
// The default configuration must not drop any of them.
test('by default no tap is ever dropped, however fast they arrive', () => {
    const seq = createTapSequence();
    const clock = { now: 1_000_000 };

    for (let i = 0; i < 16; i++) {
        clock.now += 16;
        seq.tap(ZONE_1, clock.now);
    }
    tapMany(seq, ZONE_2, 3, clock);
    const result = tapMany(seq, ZONE_3, 7, clock);

    assert.equal(result.unlocked, true, '16 fast taps must still count as 16');
});

test('a ghost tap does not consume one of the sixteen when debounce is enabled', () => {
    const seq = createTapSequence({ debounceMs: 30 });
    const clock = newClock();

    // Every real tap arrives with a duplicate 5ms behind it.
    for (let i = 0; i < 16; i++) {
        clock.now += 100;
        seq.tap(ZONE_1, clock.now);
        seq.tap(ZONE_1, clock.now + 5);
    }
    tapMany(seq, ZONE_2, 3, clock);
    const result = tapMany(seq, ZONE_3, 7, clock);

    assert.equal(result.unlocked, true, 'ghosts must not steal taps from the count');
});

test('going idle past the timeout abandons the run', () => {
    const seq = createTapSequence();
    const clock = newClock();

    tapMany(seq, ZONE_1, 5, clock);

    clock.now += 9000; // longer than the 8s idle window
    const late = seq.tap(ZONE_1, clock.now);

    assert.equal(late.timedOut, true, 'the stale run should be abandoned');

    // That late tap starts a fresh run, so 15 more finish the first step.
    tapMany(seq, ZONE_1, 15, clock);
    tapMany(seq, ZONE_2, 3, clock);
    const result = tapMany(seq, ZONE_3, 7, clock);

    assert.equal(result.unlocked, true, 'the late tap should count as tap 1 of a new run');
});

test('a pause shorter than the timeout keeps the run alive', () => {
    const seq = createTapSequence();
    const clock = newClock();

    tapMany(seq, ZONE_1, 8, clock);
    clock.now += 7000; // she hesitated, but under 8s
    tapMany(seq, ZONE_1, 8, clock);
    tapMany(seq, ZONE_2, 3, clock);
    const result = tapMany(seq, ZONE_3, 7, clock);

    assert.equal(result.unlocked, true, 'a 7s pause must not cost her the run');
});
