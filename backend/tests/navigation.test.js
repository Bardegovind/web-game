'use strict';

const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let nav;

before(async () => {
    nav = await import('../../frontend/chamber/app/navigation.ts');
});

test('the bottom bar has exactly five sections, in order', () => {
    assert.deepEqual(nav.SECTIONS.map((s) => s.label), ['Today', 'Chat', 'Moments', 'Letters', 'More']);
});

test('More holds Story and List', () => {
    assert.deepEqual(nav.MORE_SCREENS.map((s) => [s.id, s.label]), [['story', 'Story'], ['list', 'List']]);
});

test('the four main screens each light up their own section', () => {
    for (const screen of ['today', 'chat', 'moments', 'letters']) {
        assert.equal(nav.sectionFor(screen), screen);
    }
});

test('Story and List light up More', () => {
    assert.equal(nav.sectionFor('story'), 'more');
    assert.equal(nav.sectionFor('list'), 'more');
});

test('every screen belongs to a section shown in the bar', () => {
    const shown = new Set(nav.SECTIONS.map((s) => s.id));
    for (const screen of nav.SCREENS) {
        assert.ok(shown.has(nav.sectionFor(screen)), `${screen} has nowhere to be highlighted`);
    }
});

test('moving right along the bar slides forward, moving left slides back', () => {
    assert.equal(nav.directionBetween('today', 'chat'), 1);
    assert.equal(nav.directionBetween('letters', 'today'), -1);
    assert.equal(nav.directionBetween('letters', 'story'), 1);
    assert.equal(nav.directionBetween('chat', 'chat'), 0);
});
