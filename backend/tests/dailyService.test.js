'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createDailyService, dayKey, pickForDay } = require('../services/daily.service');

const PROMPTS = [
    'If we could disappear anywhere for 24 hours, where would we go?',
    'What is the smallest thing I do that you like?',
    'What were you thinking the first time we spoke?',
    'What should we do next month that we keep putting off?',
    'What is something you have never told me?',
];

function fakeQuestions() {
    const rows = [];
    return {
        rows,
        async findOne(query) {
            return rows.find((r) => r.day === query.day) || null;
        },
        async create(doc) {
            const row = { ...doc, answers: doc.answers || [], save: async () => {} };
            rows.push(row);
            return row;
        },
    };
}

test('a day key is the calendar day, not a timestamp', () => {
    assert.equal(dayKey(new Date(2026, 8, 11, 23, 59)), '2026-09-11');
    assert.equal(dayKey(new Date(2026, 8, 11, 0, 1)), '2026-09-11');
});

test('day keys pad months and days', () => {
    assert.equal(dayKey(new Date(2026, 0, 5)), '2026-01-05');
});

/**
 * Both people must see the same question on the same day without a scheduler
 * running anywhere, so the choice is derived from the date itself.
 */
test('the same day always picks the same item', () => {
    const first = pickForDay(PROMPTS, '2026-09-11');
    const second = pickForDay(PROMPTS, '2026-09-11');

    assert.equal(first, second);
});

test('different days pick different items', () => {
    const days = ['2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15'];
    const picked = new Set(days.map((day) => pickForDay(PROMPTS, day)));

    assert.ok(picked.size > 1, 'the question should not be the same every day');
});

test('picking from an empty list gives nothing rather than throwing', () => {
    assert.equal(pickForDay([], '2026-09-11'), null);
});

test('the first person to look creates the day\'s question', async () => {
    const Question = fakeQuestions();
    const daily = createDailyService({
        Question,
        prompts: PROMPTS,
        now: () => new Date(2026, 8, 11, 9, 0),
    });

    const question = await daily.questionForToday();

    assert.equal(question.day, '2026-09-11');
    assert.ok(PROMPTS.includes(question.text));
    assert.equal(Question.rows.length, 1);
});

test('the second person gets the same question, not a new one', async () => {
    const Question = fakeQuestions();
    const daily = createDailyService({
        Question,
        prompts: PROMPTS,
        now: () => new Date(2026, 8, 11, 9, 0),
    });

    const hers = await daily.questionForToday();
    const his = await daily.questionForToday();

    assert.equal(hers.text, his.text, 'they must be answering the same question');
    assert.equal(Question.rows.length, 1, 'and only one should have been created');
});

test('answering records who said what', async () => {
    const Question = fakeQuestions();
    const daily = createDailyService({
        Question,
        prompts: PROMPTS,
        now: () => new Date(2026, 8, 11, 9, 0),
    });

    await daily.answerToday({ username: 'radhe', text: 'somewhere with no phone signal' });
    const question = await daily.questionForToday();

    assert.equal(question.answers.length, 1);
    assert.equal(question.answers[0].username, 'radhe');
    assert.equal(question.answers[0].text, 'somewhere with no phone signal');
});

test('answering again replaces rather than piles up', async () => {
    const Question = fakeQuestions();
    const daily = createDailyService({
        Question,
        prompts: PROMPTS,
        now: () => new Date(2026, 8, 11, 9, 0),
    });

    await daily.answerToday({ username: 'radhe', text: 'first thought' });
    await daily.answerToday({ username: 'radhe', text: 'actually, this' });
    const question = await daily.questionForToday();

    assert.equal(question.answers.length, 1, 'changing her mind should not add a second answer');
    assert.equal(question.answers[0].text, 'actually, this');
});

test('both people can answer', async () => {
    const Question = fakeQuestions();
    const daily = createDailyService({
        Question,
        prompts: PROMPTS,
        now: () => new Date(2026, 8, 11, 9, 0),
    });

    await daily.answerToday({ username: 'radhe', text: 'hers' });
    await daily.answerToday({ username: 'govind', text: 'his' });
    const question = await daily.questionForToday();

    assert.equal(question.answers.length, 2);
});

test('an empty answer is refused', async () => {
    const Question = fakeQuestions();
    const daily = createDailyService({
        Question,
        prompts: PROMPTS,
        now: () => new Date(2026, 8, 11, 9, 0),
    });

    await assert.rejects(() => daily.answerToday({ username: 'radhe', text: '   ' }));
});

/** An old photo resurfacing is the whole point — today's upload is not a memory yet. */
test('the memory of the day comes from the older photos', async () => {
    const recent = { _id: 'new', createdAt: new Date(2026, 8, 10), url: 'recent.jpg' };
    const old = { _id: 'old', createdAt: new Date(2025, 2, 14), url: 'old.jpg' };

    const daily = createDailyService({
        GalleryItem: { find: () => ({ lean: async () => [recent, old] }) },
        prompts: PROMPTS,
        now: () => new Date(2026, 8, 11),
        minimumAgeDays: 30,
    });

    const memory = await daily.memoryOfTheDay();

    assert.equal(memory._id, 'old', 'a photo from yesterday is not yet a memory');
});

test('with no old photos there is simply no memory of the day', async () => {
    const daily = createDailyService({
        GalleryItem: { find: () => ({ lean: async () => [] }) },
        prompts: PROMPTS,
        now: () => new Date(2026, 8, 11),
    });

    assert.equal(await daily.memoryOfTheDay(), null);
});

test('the memory of the day is stable within a day', async () => {
    const photos = Array.from({ length: 10 }, (_, i) => ({
        _id: `p${i}`, createdAt: new Date(2025, 0, i + 1), url: `${i}.jpg`,
    }));
    const daily = createDailyService({
        GalleryItem: { find: () => ({ lean: async () => photos }) },
        prompts: PROMPTS,
        now: () => new Date(2026, 8, 11),
    });

    const first = await daily.memoryOfTheDay();
    const second = await daily.memoryOfTheDay();

    assert.equal(first._id, second._id, 'it must not change every time she opens the app');
});
