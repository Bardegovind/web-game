'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { formatTime, formatDayLabel, isSameDay } = require('../../frontend/js/timeFormat.js');

// A fixed "now" so these never depend on when the suite runs.
const NOW = new Date(2026, 8, 11, 14, 30); // 11 September 2026, 14:30

const at = (y, m, d, h, min) => new Date(y, m, d, h, min);

test('a morning time reads without a leading zero', () => {
    assert.equal(formatTime(at(2026, 8, 11, 9, 28)), '9:28 AM');
});

test('an evening time reads as pm', () => {
    assert.equal(formatTime(at(2026, 8, 11, 21, 28)), '9:28 PM');
});

test('midnight reads as 12 AM, not 0', () => {
    assert.equal(formatTime(at(2026, 8, 11, 0, 5)), '12:05 AM');
});

test('noon reads as 12 PM', () => {
    assert.equal(formatTime(at(2026, 8, 11, 12, 0)), '12:00 PM');
});

test('today is labelled Today', () => {
    assert.equal(formatDayLabel(at(2026, 8, 11, 9, 0), NOW), 'Today');
});

test('yesterday is labelled Yesterday', () => {
    assert.equal(formatDayLabel(at(2026, 8, 10, 23, 59), NOW), 'Yesterday');
});

test('an earlier day this year shows the day and month', () => {
    assert.equal(formatDayLabel(at(2026, 2, 29, 10, 0), NOW), '29 March');
});

test('a day in an earlier year includes the year', () => {
    assert.equal(formatDayLabel(at(2025, 11, 25, 10, 0), NOW), '25 December 2025');
});

/**
 * The reason any of this exists. Without a day label a conversation spanning
 * two evenings reads as though the clock ran backwards: 10:37 PM followed by
 * 10:07 PM looks like the messages are out of order when they are not.
 */
test('two messages at the same clock time on different days are not the same day', () => {
    assert.equal(isSameDay(at(2026, 8, 10, 22, 37), at(2026, 8, 11, 22, 7)), false);
});

test('two messages on the same day are the same day', () => {
    assert.equal(isSameDay(at(2026, 8, 11, 9, 28), at(2026, 8, 11, 22, 7)), true);
});

test('the same clock time in different months is not the same day', () => {
    assert.equal(isSameDay(at(2026, 7, 11, 10, 0), at(2026, 8, 11, 10, 0)), false);
});

test('the same date in different years is not the same day', () => {
    assert.equal(isSameDay(at(2025, 8, 11, 10, 0), at(2026, 8, 11, 10, 0)), false);
});

test('an unparseable date does not crash the message list', () => {
    assert.equal(formatTime('not a date'), '');
    assert.equal(formatDayLabel('not a date', NOW), '');
});

test('an ISO string from the server is accepted', () => {
    const iso = at(2026, 8, 11, 21, 28).toISOString();
    assert.equal(formatTime(iso), '9:28 PM');
    assert.equal(formatDayLabel(iso, NOW), 'Today');
});
