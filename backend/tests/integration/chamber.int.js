'use strict';

/**
 * Integration proof against a real MongoDB and the real server process.
 *
 * Everything else in the suite runs against stand-ins. This runs the actual
 * server.js, against an actual database, over actual HTTP.
 *
 * Points at a throwaway container, never at the production cluster. Run:
 *   docker run -d --name wg-test-mongo -p 27018:27017 mongo:7
 *   npm run test:int
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const mongoose = require('mongoose');

const MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27018/wg_int_test';
const PORT = 5099;
const BASE = `http://127.0.0.1:${PORT}`;

const HER = 'her';
const HER_PASSWORD = 'her-secret-password';
const HIM = 'him';
const HIS_PASSWORD = 'his-different-password';

const SERVER_ENV = {
    ...process.env,
    MONGO_URI,
    PORT: String(PORT),
    JWT_SECRET: 'integration-test-secret',
    MASTER_PASSWORD: 'legacy-master-password',
    USER_A_NAME: HER,
    USER_A_PASSWORD: HER_PASSWORD,
    USER_B_NAME: HIM,
    USER_B_PASSWORD: HIS_PASSWORD,
    CLOUDINARY_CLOUD_NAME: 'unused',
    CLOUDINARY_API_KEY: 'unused',
    CLOUDINARY_API_SECRET: 'unused',
};

let child = null;

async function waitForHealth(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`${BASE}/api/health`);
            if (res.ok) return true;
        } catch { /* not up yet */ }
        await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('server did not become healthy in time');
}

async function startServer() {
    child = spawn('node', ['server.js'], {
        cwd: path.join(__dirname, '..', '..'),
        env: SERVER_ENV,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
    await waitForHealth(20000);
}

function stopServer() {
    if (child) child.kill('SIGKILL');
    child = null;
}

const login = (username, password) =>
    fetch(`${BASE}/api/auth/verify-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
    }).then((r) => r.json().then((body) => ({ status: r.status, body })));

const authed = (token, url, init) =>
    fetch(`${BASE}${url}`, {
        ...init,
        headers: { ...(init && init.headers), Authorization: `Bearer ${token}` },
    }).then((r) => r.json().then((body) => ({ status: r.status, body })));

test('chamber integration', async (t) => {
    await mongoose.connect(MONGO_URI);
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();

    await startServer();
    t.after(stopServer);

    let herToken = null;

    await t.test('her password signs her in', async () => {
        const { status, body } = await login(HER, HER_PASSWORD);
        assert.equal(status, 200);
        assert.equal(body.success, true);
        assert.equal(body.username, HER);
        assert.ok(body.token);
        herToken = body.token;
    });

    await t.test('her password cannot sign anyone in as him', async () => {
        const { status, body } = await login(HIM, HER_PASSWORD);
        assert.equal(status, 401, 'the impersonation hole must be closed');
        assert.equal(body.success, false);
        assert.equal(body.token, undefined);
    });

    await t.test('an invented username is refused', async () => {
        const { status } = await login('someone-else', HER_PASSWORD);
        assert.equal(status, 401);
    });

    await t.test('repeated guessing gets rate limited', async () => {
        let sawLimit = false;
        for (let i = 0; i < 12; i++) {
            const { status } = await login(HER, `guess-${i}`);
            if (status === 429) { sawLimit = true; break; }
        }
        assert.equal(sawLimit, true, 'brute forcing the one password must be throttled');

        // And she is not collateral damage from her own earlier success.
        const stillBlocked = await login(HER, HER_PASSWORD);
        assert.equal(stillBlocked.status, 429, 'the block is per-address while it lasts');
    });

    await t.test('history returns the newest messages once past the limit', async () => {
        await mongoose.connect(MONGO_URI);
        const Message = mongoose.connection.collection('messages');
        const { conversationKeyFor } = require('../../services/chat.service');

        const docs = Array.from({ length: 250 }, (_, i) => ({
            sender: i % 2 === 0 ? HER : HIM,
            receiver: i % 2 === 0 ? HIM : HER,
            text: `message ${i}`,
            type: 'text',
            conversationKey: conversationKeyFor(HER, HIM),
            createdAt: new Date(2026, 0, 1, 0, i),
            updatedAt: new Date(2026, 0, 1, 0, i),
        }));
        await Message.insertMany(docs);
        await mongoose.disconnect();

        // Fresh token: the rate limiter window is still open from the last test,
        // so restart the server to clear its in-memory state.
        stopServer();
        await startServer();
        const { body } = await login(HER, HER_PASSWORD);
        herToken = body.token;

        const { body: history } = await authed(herToken, `/api/chat/messages/${HIM}`);

        assert.equal(history.messages.length, 200);
        assert.equal(
            history.messages[history.messages.length - 1].text,
            'message 249',
            'the newest message must be present — this is the bug that freezes the chat'
        );
        assert.equal(history.messages[0].text, 'message 50');
    });

    await t.test('unread survives a restart', async () => {
        const before = await authed(herToken, '/api/chat/conversations');
        const him = before.body.conversations.find((c) => c.username === HIM);
        assert.ok(him, 'he should appear in her conversation list');
        assert.ok(him.unreadCount > 0, 'unopened messages count as unread');

        await authed(herToken, `/api/chat/read/${HIM}`, { method: 'POST' });

        const after = await authed(herToken, '/api/chat/conversations');
        const cleared = after.body.conversations.find((c) => c.username === HIM);
        assert.equal(cleared.unreadCount, 0, 'reading it clears the badge');

        // The whole point: this state is stored, not held in a browser.
        stopServer();
        await startServer();
        const fresh = await login(HER, HER_PASSWORD);
        const reloaded = await authed(fresh.body.token, '/api/chat/conversations');
        const stillCleared = reloaded.body.conversations.find((c) => c.username === HIM);

        assert.equal(stillCleared.unreadCount, 0, 'the badge must not come back after a restart');
    });

    await t.test('the backfill gives old messages a conversation key', async () => {
        stopServer();

        await mongoose.connect(MONGO_URI);
        const Message = mongoose.connection.collection('messages');
        await Message.insertOne({
            sender: HIM, receiver: HER, text: 'written before the key existed',
            type: 'text', createdAt: new Date(2026, 0, 2), updatedAt: new Date(2026, 0, 2),
        });
        const missingBefore = await Message.countDocuments({ conversationKey: { $exists: false } });
        assert.equal(missingBefore, 1);
        await mongoose.disconnect();

        await startServer();

        await mongoose.connect(MONGO_URI);
        const missingAfter = await mongoose.connection.collection('messages')
            .countDocuments({ conversationKey: { $exists: false } });
        const preserved = await mongoose.connection.collection('messages')
            .findOne({ text: 'written before the key existed' });
        await mongoose.disconnect();

        assert.equal(missingAfter, 0, 'startup should have backfilled it');
        assert.equal(preserved.text, 'written before the key existed', 'content untouched');
    });

    await t.test('an unknown API route returns JSON, not the HTML page', async () => {
        const res = await fetch(`${BASE}/api/does-not-exist`);
        const type = res.headers.get('content-type') || '';
        assert.ok(
            type.includes('application/json'),
            `expected JSON for an unknown API route, got ${type} — HTML here breaks every fetch in the client`
        );
    });
});
