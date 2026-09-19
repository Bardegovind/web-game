'use strict';

/**
 * The chamber running on the shared master password — which is how it is
 * actually deployed.
 *
 * With `USER_A_*` / `USER_B_*` set, every account exists in `users` before
 * anyone logs in. Without them there is one password, and a person only
 * becomes a row — a `ChamberUser` — once they walk in. Anything that asks
 * "who is the other person?" has to look there instead, or the answer is
 * "nobody" and the feature refuses to work at all.
 *
 * Port 5087.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const mongoose = require('mongoose');
const { io: connect } = require('socket.io-client');

const { isReachable, SKIP_MESSAGE } = require('./requireMongo');

const MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27018/wg_shared_password_test';
const PORT = 5087;
const BASE = `http://127.0.0.1:${PORT}`;

const MASTER = 'the-one-password';
const HER = 'radhe';
const HIM = 'govind';

const SERVER_ENV = {
    ...process.env,
    MONGO_URI,
    PORT: String(PORT),
    JWT_SECRET: 'shared-password-test-secret',
    MASTER_PASSWORD: MASTER,
    // The point of this file: no per-user accounts at all. Set to empty rather
    // than deleted, so a stray value in backend/.env cannot bring them back.
    USER_A_NAME: '',
    USER_A_PASSWORD: '',
    USER_B_NAME: '',
    USER_B_PASSWORD: '',
    CLOUDINARY_CLOUD_NAME: 'unused',
    CLOUDINARY_API_KEY: 'unused',
    CLOUDINARY_API_SECRET: 'unused',
    REDIS_URL: '',
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

const login = async (username) => {
    const res = await fetch(`${BASE}/api/auth/verify-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: MASTER }),
    });
    const body = await res.json();
    assert.equal(body.success, true, `${username} should get in with the shared password`);
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

/** Walking in: a socket connection is what writes the ChamberUser row. */
function openSocket(token) {
    const socket = connect(BASE, { auth: { token }, transports: ['websocket'], forceNew: true });
    return new Promise((resolve, reject) => {
        socket.on('connect', () => resolve(socket));
        socket.on('connect_error', reject);
    });
}

test('the chamber on a shared password', async (t) => {
    if (!(await isReachable(MONGO_URI))) return t.skip(SKIP_MESSAGE);

    await mongoose.connect(MONGO_URI);
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();

    await startServer();
    t.after(() => { if (child) child.kill('SIGKILL'); });

    const hisToken = await login(HIM);
    const herToken = await login(HER);

    const hisSocket = await openSocket(hisToken);
    const herSocket = await openSocket(herToken);
    t.after(() => { hisSocket.close(); herSocket.close(); });
    await new Promise((r) => setTimeout(r, 300)); // the rows are written on connect

    await t.test('nobody is in the accounts collection, only in the chamber', async () => {
        await mongoose.connect(MONGO_URI);
        const accounts = await mongoose.connection.db.collection('users').countDocuments();
        const inside = await mongoose.connection.db.collection('chamberusers').countDocuments();
        await mongoose.disconnect();

        assert.equal(accounts, 0, 'no per-user accounts are configured');
        assert.equal(inside, 2, 'but both of them have walked in');
    });

    await t.test('a heart still reaches the other person', async () => {
        const sent = await call(hisToken, 'POST', '/api/chamber/nudge');

        assert.equal(sent.status, 200, `the tap must not be refused: ${JSON.stringify(sent.body)}`);
        assert.equal(sent.body.sent, true);

        const waiting = await call(herToken, 'GET', '/api/chamber/nudge/pending');
        assert.equal(waiting.body.nudges.length, 1);
        assert.equal(waiting.body.nudges[0].from, HIM);
    });

    await t.test('a letter still has someone to be written for', async () => {
        const written = await call(hisToken, 'POST', '/api/chamber/letters', {
            prompt: 'Open when you miss me',
            body: 'Then read this twice.',
        });
        assert.equal(written.status, 201, `writing must not be refused: ${JSON.stringify(written.body)}`);

        const hers = await call(herToken, 'GET', '/api/chamber/letters');
        assert.equal(hers.body.letters.length, 1, 'the letter is waiting for her');
        assert.equal(hers.body.letters[0].writtenBy, HIM);
    });

    await t.test('today counts what is waiting from the other person', async () => {
        const { body } = await call(herToken, 'GET', '/api/chamber/today');

        assert.equal(body.today.unopenedLetters, 1, 'the letter he just wrote is waiting');
        assert.ok(body.today.pendingNudge, 'and so is the heart');
        assert.equal(body.today.pendingNudge.from, HIM);
    });
});
