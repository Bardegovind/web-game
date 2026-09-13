'use strict';

/**
 * Today's question, when two requests that need it arrive at once.
 *
 * Entering the chamber prefetches Today and the question together, and on the
 * first entry of a day neither finds a question yet. Both try to create one;
 * the unique index on `day` lets only one of them succeed. The other must end
 * up with that same question rather than a 500.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const { isReachable, SKIP_MESSAGE } = require('./requireMongo');
const Question = require('../../models/Question');
const { createDailyService } = require('../../services/daily.service');

const MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27018/wg_daily_int';

const PROMPTS = [
    'What made you smile today?',
    'Where should we go next?',
    'What are you looking forward to this week?',
];

test("creating the day's question concurrently gives every caller the same one, and none an error", async (t) => {
    if (!(await isReachable(MONGO_URI))) return t.skip(SKIP_MESSAGE);

    await mongoose.connect(MONGO_URI);
    t.after(() => mongoose.disconnect());

    await Question.init();
    await mongoose.connection.db.dropDatabase();
    // Dropping the database took the unique `day` index with it; production has it.
    await Question.createIndexes();

    const daily = createDailyService({
        Question,
        GalleryItem: null,
        prompts: PROMPTS,
        now: () => new Date(2026, 8, 13, 9, 0),
    });

    const results = await Promise.allSettled(Array.from({ length: 8 }, () => daily.questionForToday()));

    const failures = results.filter((r) => r.status === 'rejected').map((r) => String(r.reason && r.reason.message));
    assert.deepEqual(failures, [], 'no caller should fail because another created the question first');

    const ids = new Set(results.map((r) => String(r.value._id)));
    assert.equal(ids.size, 1, 'every caller should get the same question');
    assert.equal(await Question.countDocuments({ day: '2026-09-13' }), 1, 'and exactly one should be stored');
});
