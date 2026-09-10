'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createRateLimiter } = require('../services/rateLimiter');

const MINUTE = 60 * 1000;

function build(overrides) {
    const options = overrides || {};
    const clock = { now: 1_000_000 };
    const limiter = createRateLimiter({
        max: options.max || 5,
        windowMs: options.windowMs || 15 * MINUTE,
        now: () => clock.now,
    });
    return { limiter, clock };
}

test('attempts are allowed up to the limit', () => {
    const { limiter } = build();

    for (let i = 0; i < 5; i++) {
        assert.equal(limiter.check('1.2.3.4').allowed, true, `attempt ${i + 1} should be allowed`);
        limiter.recordFailure('1.2.3.4');
    }
});

test('the attempt after the limit is blocked', () => {
    const { limiter } = build();

    for (let i = 0; i < 5; i++) {
        limiter.check('1.2.3.4');
        limiter.recordFailure('1.2.3.4');
    }

    const blocked = limiter.check('1.2.3.4');
    assert.equal(blocked.allowed, false, 'a sixth guess must be refused');
    assert.ok(blocked.retryAfterMs > 0, 'the caller needs to know how long to wait');
});

test('the block lifts once the window has passed', () => {
    const { limiter, clock } = build();

    for (let i = 0; i < 6; i++) {
        limiter.check('1.2.3.4');
        limiter.recordFailure('1.2.3.4');
    }
    assert.equal(limiter.check('1.2.3.4').allowed, false);

    clock.now += 15 * MINUTE + 1;

    assert.equal(limiter.check('1.2.3.4').allowed, true, 'the window should expire');
});

test('signing in successfully clears the failures', () => {
    const { limiter } = build();

    for (let i = 0; i < 4; i++) {
        limiter.check('1.2.3.4');
        limiter.recordFailure('1.2.3.4');
    }

    limiter.recordSuccess('1.2.3.4');

    for (let i = 0; i < 5; i++) {
        assert.equal(limiter.check('1.2.3.4').allowed, true, 'a mistyped password should not count against her later');
        limiter.recordFailure('1.2.3.4');
    }
});

test('one blocked address does not block anyone else', () => {
    const { limiter } = build();

    for (let i = 0; i < 6; i++) {
        limiter.check('1.2.3.4');
        limiter.recordFailure('1.2.3.4');
    }

    assert.equal(limiter.check('1.2.3.4').allowed, false);
    assert.equal(limiter.check('5.6.7.8').allowed, true, 'she must not be locked out by someone else guessing');
});

test('old entries are dropped so the map cannot grow without bound', () => {
    const { limiter, clock } = build();

    for (let i = 0; i < 50; i++) {
        limiter.recordFailure(`10.0.0.${i}`);
    }
    assert.equal(limiter.size, 50);

    clock.now += 15 * MINUTE + 1;
    limiter.check('10.0.0.0');

    assert.ok(limiter.size < 50, 'expired entries should be swept, not retained forever');
});
