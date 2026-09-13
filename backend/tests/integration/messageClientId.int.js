'use strict';

/**
 * The clientId a sender's device gave a message is stored with it and comes
 * back in history.
 *
 * Without it, history could not be matched to the copy already on the
 * sender's screen: a message whose acknowledgement was lost showed twice,
 * once as "Not sent", until a reload. Only a short, plain id is kept; anything
 * else is stored as nothing. Real server, real socket, real database.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const mongoose = require('mongoose');
const { io: connect } = require('socket.io-client');
const { isReachable, SKIP_MESSAGE } = require('./requireMongo');

const MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27018/wg_message_client_id_int';
const PORT = 5095;
const BASE = `http://127.0.0.1:${PORT}`;

const HER = 'her';
const HER_PASSWORD = 'her-secret-password';
const HIM = 'him';
const HIS_PASSWORD = 'his-different-password';

const SERVER_ENV = {
    ...process.env,
    MONGO_URI,
    PORT: String(PORT),
    JWT_SECRET: 'message-client-id-secret',
    MASTER_PASSWORD: 'legacy-master',
    USER_A_NAME: HER,
    USER_A_PASSWORD: HER_PASSWORD,
    USER_B_NAME: HIM,
    USER_B_PASSWORD: HIS_PASSWORD,
    CLOUDINARY_CLOUD_NAME: 'unused',
    CLOUDINARY_API_KEY: 'unused',
    CLOUDINARY_API_SECRET: 'unused',
    // Set, so dotenv cannot supply one from backend/.env; empty means no Redis.
    REDIS_URL: '',
};

let child = null;

async function startServer() {
    child = spawn('node', ['server.js'], {
        cwd: path.join(__dirname, '..', '..'),
        env: SERVER_ENV,
        stdio: ['ignore', 'ignore', 'pipe'],
    });
    child.stderr.on('data', (d) => process.stderr.write(`[server:${PORT}] ${d}`));

    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        try {
            if ((await fetch(`${BASE}/api/health`)).ok) return;
        } catch { /* not up yet */ }
        await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('server did not become healthy');
}

async function login(username, password) {
    const res = await fetch(`${BASE}/api/auth/verify-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
    });
    const body = await res.json();
    assert.equal(body.success, true, `login failed for ${username}`);
    return body.token;
}

function openSocket(token) {
    const socket = connect(BASE, { auth: { token }, transports: ['websocket'], forceNew: true });
    return new Promise((resolve, reject) => {
        socket.on('connect', () => resolve(socket));
        socket.on('connect_error', reject);
    });
}

/** Resolves with the first payload for `event` that satisfies `match`, or rejects on timeout. */
function nextEvent(socket, event, timeoutMs, match) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.off(event, listener);
            reject(new Error(`timed out waiting for ${event}`));
        }, timeoutMs);

        function listener(payload) {
            if (match && !match(payload)) return;
            clearTimeout(timer);
            socket.off(event, listener);
            resolve(payload);
        }

        socket.on(event, listener);
    });
}

test('a message keeps the clientId it was sent with', async (t) => {
    if (!(await isReachable(MONGO_URI))) return t.skip(SKIP_MESSAGE);

    await mongoose.connect(MONGO_URI);
    await mongoose.connection.db.dropDatabase();

    let herSocket = null;
    t.after(async () => {
        if (herSocket) herSocket.close();
        if (child) child.kill('SIGKILL');
        await mongoose.disconnect();
    });

    await startServer();
    const herToken = await login(HER, HER_PASSWORD);
    herSocket = await openSocket(herToken);

    /** Sends as her and resolves with the stored document and her history entry for it. */
    async function sendAndLookUp(payload, matches) {
        const confirmed = nextEvent(herSocket, 'message:sent', 5000, matches);
        herSocket.emit('message:send', { receiver: HIM, ...payload });
        const ack = await confirmed;

        const stored = await mongoose.connection.collection('messages')
            .findOne({ _id: new mongoose.Types.ObjectId(ack._id) });

        const res = await fetch(`${BASE}/api/chat/messages/${HIM}`, {
            headers: { Authorization: `Bearer ${herToken}` },
        });
        assert.equal(res.status, 200);
        const { messages } = await res.json();
        const inHistory = messages.find((m) => m._id === ack._id);

        assert.ok(stored, 'the message should be stored');
        assert.ok(inHistory, 'the message should be in history');
        return { ack, stored, inHistory };
    }

    const byText = (text) => (m) => m.text === text;

    await t.test('a valid clientId is stored and returned by history', async () => {
        const clientId = '3b241101-e2bb-4255-8caf-4136c566a962';
        const { ack, stored, inHistory } = await sendAndLookUp(
            { text: 'keep my id', type: 'text', clientId }, byText('keep my id')
        );

        assert.equal(ack.clientId, clientId, 'the acknowledgement still echoes it');
        assert.equal(stored.clientId, clientId, 'it should be stored with the message');
        assert.equal(inHistory.clientId, clientId, 'history should return it');
    });

    await t.test('the fallback id format and a 64-character id are kept', async () => {
        const fallback = `c-${Date.now()}-9f86d081884c7d65`;
        const fromFallback = await sendAndLookUp(
            { text: 'fallback id', type: 'text', clientId: fallback }, byText('fallback id')
        );
        assert.equal(fromFallback.inHistory.clientId, fallback);

        const longest = 'a'.repeat(64);
        const fromLongest = await sendAndLookUp(
            { text: 'longest id', type: 'text', clientId: longest }, byText('longest id')
        );
        assert.equal(fromLongest.inHistory.clientId, longest);
    });

    await t.test('a photo keeps its clientId too', async () => {
        const clientId = 'photo-7c9e6679-7425-40de-944b';
        const fileUrl = 'https://res.cloudinary.com/unused/image/upload/v1/photo.jpg';
        const { stored, inHistory } = await sendAndLookUp(
            { type: 'image', fileUrl, clientId }, (m) => m.fileUrl === fileUrl
        );

        assert.equal(stored.clientId, clientId);
        assert.equal(inHistory.clientId, clientId);
    });

    await t.test('an oversized, non-string or oddly shaped clientId is not stored', async () => {
        const cases = [
            ['oversized', 'a'.repeat(65)],
            ['a number', 42],
            ['an object', { $gt: '' }],
            ['spaces and markup', 'not <an> id'],
            ['empty', ''],
        ];

        for (const [name, clientId] of cases) {
            const text = `bad id: ${name}`;
            const { stored, inHistory } = await sendAndLookUp({ text, type: 'text', clientId }, byText(text));

            assert.equal(stored.clientId, undefined, `${name}: nothing should be stored`);
            assert.equal(inHistory.clientId, undefined, `${name}: history should carry none`);
        }
    });

    await t.test('a message sent without a clientId has none', async () => {
        const { stored, inHistory } = await sendAndLookUp({ text: 'no id at all', type: 'text' }, byText('no id at all'));

        assert.equal(stored.clientId, undefined);
        assert.equal(inHistory.clientId, undefined);
    });
});
