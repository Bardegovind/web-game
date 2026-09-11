'use strict';

/**
 * The personal features, against a real server and a real database.
 *
 * These are the parts she is meant to come back for, so the things that must
 * not go wrong are: a letter cannot be read before it is opened, both people
 * get the same question, and the shared list is genuinely shared.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const mongoose = require('mongoose');

const { isReachable, SKIP_MESSAGE } = require('./requireMongo');

const MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27018/wg_features_test';
const PORT = 5091;
const BASE = `http://127.0.0.1:${PORT}`;

const HER = 'radhe';
const HER_PASSWORD = 'her-secret-password';
const HIM = 'govind';
const HIS_PASSWORD = 'his-different-password';

const SERVER_ENV = {
    ...process.env,
    MONGO_URI,
    PORT: String(PORT),
    JWT_SECRET: 'features-test-secret',
    MASTER_PASSWORD: 'legacy-master',
    USER_A_NAME: HER,
    USER_A_PASSWORD: HER_PASSWORD,
    USER_B_NAME: HIM,
    USER_B_PASSWORD: HIS_PASSWORD,
    CLOUDINARY_CLOUD_NAME: 'unused',
    CLOUDINARY_API_KEY: 'unused',
    CLOUDINARY_API_SECRET: 'unused',
};

let child = null;

async function startServer() {
    child = spawn('node', ['server.js'], {
        cwd: path.join(__dirname, '..', '..'),
        env: SERVER_ENV,
        stdio: ['ignore', 'ignore', 'pipe'],
    });
    child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        try {
            if ((await fetch(`${BASE}/api/health`)).ok) return;
        } catch { /* not up yet */ }
        await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('server did not become healthy');
}

const login = async (username, password) => {
    const res = await fetch(`${BASE}/api/auth/verify-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
    });
    const body = await res.json();
    assert.equal(body.success, true, `login failed for ${username}`);
    return body.token;
};

const call = (token, method, url, body) =>
    fetch(`${BASE}${url}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json() }));

test('chamber features', async (t) => {
    if (!(await isReachable(MONGO_URI))) return t.skip(SKIP_MESSAGE);

    await mongoose.connect(MONGO_URI);
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();

    await startServer();
    t.after(() => { if (child) child.kill('SIGKILL'); });

    const herToken = await login(HER, HER_PASSWORD);
    const himToken = await login(HIM, HIS_PASSWORD);

    let letterId = null;

    await t.test('he writes her a letter', async () => {
        const { status, body } = await call(himToken, 'POST', '/api/chamber/letters', {
            prompt: 'Open when you miss me',
            body: 'I miss you too. Come back soon.',
        });

        assert.equal(status, 201);
        assert.ok(body.letter._id);
        letterId = body.letter._id;
    });

    /** The whole idea depends on not being able to peek. */
    await t.test('an unopened letter does not give away what it says', async () => {
        const { body } = await call(herToken, 'GET', '/api/chamber/letters');

        const waiting = body.letters.find((l) => l._id === letterId);
        assert.equal(waiting.prompt, 'Open when you miss me');
        assert.equal(waiting.isOpened, false);
        assert.equal(waiting.body, undefined, 'the contents must not be in the list');
    });

    await t.test('opening it reveals it and records when', async () => {
        const { body } = await call(herToken, 'POST', `/api/chamber/letters/${letterId}/open`);

        assert.equal(body.letter.body, 'I miss you too. Come back soon.');
        assert.ok(body.letter.openedAt, 'the moment should be recorded');
    });

    await t.test('he cannot open a letter he wrote for her', async () => {
        const { status } = await call(himToken, 'POST', `/api/chamber/letters/${letterId}/open`);
        assert.equal(status, 404, 'a letter belongs to the person it was written for');
    });

    await t.test('both of them get the same question today', async () => {
        const hers = await call(herToken, 'GET', '/api/chamber/question');
        const his = await call(himToken, 'GET', '/api/chamber/question');

        assert.equal(hers.body.question.text, his.body.question.text);
        assert.ok(hers.body.question.text.length > 0);
    });

    await t.test('each of them can answer, and changing her mind replaces it', async () => {
        await call(herToken, 'POST', '/api/chamber/question', { text: 'somewhere with no signal' });
        await call(herToken, 'POST', '/api/chamber/question', { text: 'actually, the sea' });
        await call(himToken, 'POST', '/api/chamber/question', { text: 'wherever you are' });

        const { body } = await call(herToken, 'GET', '/api/chamber/question');
        const answers = body.question.answers;

        assert.equal(answers.length, 2, 'two people, two answers');
        assert.equal(answers.find((a) => a.username === HER).text, 'actually, the sea');
    });

    await t.test('an empty answer is refused with a readable message', async () => {
        const { status, body } = await call(herToken, 'POST', '/api/chamber/question', { text: '   ' });

        assert.equal(status, 400);
        assert.ok(body.message.length > 0);
        assert.ok(!body.message.includes('undefined'));
    });

    await t.test('the bucket list is shared: he adds, she ticks it off', async () => {
        const added = await call(himToken, 'POST', '/api/chamber/bucket', {
            text: 'Watch the sunrise together',
        });
        assert.equal(added.status, 201);

        const seen = await call(herToken, 'GET', '/api/chamber/bucket');
        const item = seen.body.items.find((i) => i.text === 'Watch the sunrise together');
        assert.ok(item, 'what he adds, she sees');
        assert.equal(item.done, false);

        const toggled = await call(herToken, 'PATCH', `/api/chamber/bucket/${item._id}`);
        assert.equal(toggled.body.item.done, true);
        assert.equal(toggled.body.item.doneBy, HER, 'who did it is recorded');
    });

    await t.test('a moment can be added to the story and comes back in order', async () => {
        await call(himToken, 'POST', '/api/chamber/story', {
            title: 'The beginning', happenedAt: '2025-03-29', emoji: '♡',
        });
        await call(herToken, 'POST', '/api/chamber/story', {
            title: 'That day', happenedAt: '2025-12-25', note: 'the cake',
        });

        const { body } = await call(herToken, 'GET', '/api/chamber/story');

        assert.equal(body.entries.length, 2);
        assert.equal(body.entries[0].title, 'The beginning', 'oldest first, so it reads as a story');
        assert.equal(body.entries[1].title, 'That day');
    });

    await t.test('a moment without a name is refused', async () => {
        const { status } = await call(herToken, 'POST', '/api/chamber/story', { title: '  ' });
        assert.equal(status, 400);
    });

    await t.test('today gathers what is waiting into one answer', async () => {
        // Another letter, so there is something unopened again.
        await call(himToken, 'POST', '/api/chamber/letters', {
            prompt: 'Open when you cannot sleep',
            body: 'Count the things we still have to do.',
        });

        const { body } = await call(herToken, 'GET', '/api/chamber/today');

        assert.equal(body.today.unopenedLetters, 1);
        assert.equal(body.today.question.answered, true, 'she answered earlier');
        assert.ok(typeof body.today.unreadMessages === 'number');
    });

    await t.test('none of it is reachable without signing in', async () => {
        for (const url of ['/api/chamber/today', '/api/chamber/letters', '/api/chamber/bucket']) {
            const res = await fetch(`${BASE}${url}`);
            assert.equal(res.status, 401, `${url} must require the password`);
        }
    });
});
