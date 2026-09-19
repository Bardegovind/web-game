'use strict';

const { test, before } = require('node:test');
const assert = require('node:assert/strict');

/**
 * The chamber's time formatting lives in TypeScript now. Node runs it directly,
 * so there is one implementation rather than a JavaScript copy kept in step by
 * hand.
 */
let T;

before(async () => {
    T = await import('../../frontend/chamber/utils/time.ts');
});

const NOW = new Date(2026, 8, 11, 14, 30); // 11 September 2026
const at = (y, m, d, h, min) => new Date(y, m, d, h, min);

test('a morning time reads without a leading zero', () => {
    assert.equal(T.formatTime(at(2026, 8, 11, 9, 28)), '9:28 AM');
});

test('an evening time reads as pm', () => {
    assert.equal(T.formatTime(at(2026, 8, 11, 21, 28)), '9:28 PM');
});

test('midnight reads as 12 AM, not 0', () => {
    assert.equal(T.formatTime(at(2026, 8, 11, 0, 5)), '12:05 AM');
});

test('noon reads as 12 PM', () => {
    assert.equal(T.formatTime(at(2026, 8, 11, 12, 0)), '12:00 PM');
});

test('today is labelled Today', () => {
    assert.equal(T.formatDayLabel(at(2026, 8, 11, 9, 0), NOW), 'Today');
});

test('yesterday is labelled Yesterday', () => {
    assert.equal(T.formatDayLabel(at(2026, 8, 10, 23, 59), NOW), 'Yesterday');
});

test('an earlier day this year shows the day and month', () => {
    assert.equal(T.formatDayLabel(at(2026, 2, 29, 10, 0), NOW), '29 March');
});

test('a day in an earlier year includes the year', () => {
    assert.equal(T.formatDayLabel(at(2025, 11, 25, 10, 0), NOW), '25 December 2025');
});

/**
 * The reason any of this exists: without a day label, 10:37 PM followed by
 * 10:07 PM looks like the history is out of order when the second message is
 * simply from the next day.
 */
test('two messages at the same clock time on different days are not the same day', () => {
    assert.equal(T.isSameDay(at(2026, 8, 10, 22, 37), at(2026, 8, 11, 22, 7)), false);
});

test('two messages on the same day are the same day', () => {
    assert.equal(T.isSameDay(at(2026, 8, 11, 9, 28), at(2026, 8, 11, 22, 7)), true);
});

test('the same date in different years is not the same day', () => {
    assert.equal(T.isSameDay(at(2025, 8, 11, 10, 0), at(2026, 8, 11, 10, 0)), false);
});

test('an unparseable date does not crash the message list', () => {
    assert.equal(T.formatTime('not a date'), '');
    assert.equal(T.formatDayLabel('not a date', NOW), '');
});

test('an ISO string from the server is accepted', () => {
    const iso = at(2026, 8, 11, 21, 28).toISOString();
    assert.equal(T.formatTime(iso), '9:28 PM');
    assert.equal(T.formatDayLabel(iso, NOW), 'Today');
});

test('last seen reads in plain words', () => {
    const justNow = new Date(Date.now() - 20 * 1000);
    const earlier = new Date(Date.now() - 8 * 60 * 1000);

    assert.equal(T.formatLastSeen(justNow), 'just now');
    assert.equal(T.formatLastSeen(earlier), '8 minutes ago');
});

test('the moment they met keeps the date, the year and the time of day', () => {
    assert.equal(T.formatMoment(at(2024, 3, 17, 13, 46)), '17 April 2024 at 1:46 PM');
});

test('a moment earlier today still says the date, not "Today"', () => {
    // formatDayLabel is for a stream of messages; an anchor date is a fact,
    // and "Today at 9:00 AM" stops being true tomorrow.
    assert.equal(T.formatMoment(at(2026, 8, 11, 9, 0)), '11 September 2026 at 9:00 AM');
});

test('a moment with nothing in it formats to nothing', () => {
    assert.equal(T.formatMoment(null), '');
    assert.equal(T.formatMoment('not a date'), '');
});
