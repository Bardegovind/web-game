'use strict';

/**
 * Two real clients, one real server, one real database.
 *
 * This is the test that actually proves the chat works: a message leaving one
 * browser and arriving in another, persisting, counting as unread, being marked
 * read, and behaving when the same person has two tabs open.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const mongoose = require('mongoose');
const { isReachable, SKIP_MESSAGE } = require('./requireMongo');
const { io: connect } = require('socket.io-client');

const MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27018/wg_socket_test';
const PORT = 5098;
const BASE = `http://127.0.0.1:${PORT}`;

const HER = 'her';
const HER_PASSWORD = 'her-secret-password';
const HIM = 'him';
const HIS_PASSWORD = 'his-different-password';

const SERVER_ENV = {
    ...process.env,
    MONGO_URI,
    PORT: String(PORT),
    JWT_SECRET: 'socket-test-secret',
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

async function waitForHealth(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            if ((await fetch(`${BASE}/api/health`)).ok) return;
        } catch { /* not up yet */ }
        await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('server did not become healthy');
}

async function startServer() {
    child = spawn('node', ['server.js'], {
        cwd: path.join(__dirname, '..', '..'),
        env: SERVER_ENV,
        stdio: ['ignore', 'ignore', 'pipe'],
    });
    child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
    await waitForHealth(20000);
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

function openSocket(token) {
    const socket = connect(BASE, { auth: { token }, transports: ['websocket'], forceNew: true });
    return new Promise((resolve, reject) => {
        socket.on('connect', () => resolve(socket));
        socket.on('connect_error', reject);
    });
}

/**
 * Resolves with the first payload for `event` that satisfies `match`, or
 * rejects on timeout.
 *
 * The predicate matters: these tests share two long-lived sockets, so an event
 * emitted by an earlier test can still be in flight when a later one starts
 * listening. Waiting for the specific payload rather than the next one keeps
 * the tests honest about ordering.
 */
function nextEvent(socket, event, timeoutMs = 5000, match = null) {
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

test('socket integration', async (t) => {
    if (!(await isReachable(MONGO_URI))) return t.skip(SKIP_MESSAGE);

    await mongoose.connect(MONGO_URI);
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();

    await startServer();

    const herToken = await login(HER, HER_PASSWORD);
    const himToken = await login(HIM, HIS_PASSWORD);

    const herSocket = await openSocket(herToken);
    const himSocket = await openSocket(himToken);

    t.after(() => {
        herSocket.close();
        himSocket.close();
        if (child) child.kill('SIGKILL');
    });

    await t.test('a socket without a token is refused', async () => {
        await assert.rejects(
            () => openSocket('not-a-real-token'),
            'an unauthenticated socket must not connect'
        );
    });

    await t.test('a message sent by one arrives at the other', async () => {
        const arrival = nextEvent(
            himSocket, 'message:new', 5000, (m) => m.clientId === 'client-1'
        );

        herSocket.emit('message:send', {
            receiver: HIM,
            text: 'i made something for you',
            type: 'text',
            clientId: 'client-1',
        });

        const received = await arrival;
        assert.equal(received.text, 'i made something for you');
        assert.equal(received.sender, HER);
    });

    await t.test('the sender gets an acknowledgement carrying their clientId', async () => {
        const confirmed = nextEvent(
            herSocket, 'message:sent', 5000, (m) => m.clientId === 'client-2'
        );

        herSocket.emit('message:send', {
            receiver: HIM,
            text: 'and another',
            type: 'text',
            clientId: 'client-2',
        });

        const ack = await confirmed;
        assert.equal(
            ack.clientId,
            'client-2',
            'without this an optimistically rendered message cannot be reconciled and appears twice'
        );
        assert.ok(ack._id, 'the real id must come back too');
    });

    await t.test('messages are persisted, not merely relayed', async () => {
        await mongoose.connect(MONGO_URI);
        const count = await mongoose.connection.collection('messages')
            .countDocuments({ sender: HER, receiver: HIM });
        const withKey = await mongoose.connection.collection('messages')
            .countDocuments({ conversationKey: { $exists: true } });
        await mongoose.disconnect();

        assert.equal(count, 2);
        assert.equal(withKey, 2, 'every new message should be written with its conversation key');
    });

    await t.test('the unread count reflects what arrived', async () => {
        const res = await fetch(`${BASE}/api/chat/conversations`, {
            headers: { Authorization: `Bearer ${himToken}` },
        });
        const body = await res.json();
        const her = body.conversations.find((c) => c.username === HER);

        assert.equal(her.unreadCount, 2, 'both messages are waiting for him');
        assert.equal(her.lastMessage.text, 'and another');
    });

    await t.test('reading a conversation tells the sender', async () => {
        const receipt = nextEvent(herSocket, 'message:read:ack');

        himSocket.emit('message:read', { peer: HER });

        const ack = await receipt;
        assert.equal(ack.reader, HIM, 'she should learn he has seen them');

        const res = await fetch(`${BASE}/api/chat/conversations`, {
            headers: { Authorization: `Bearer ${himToken}` },
        });
        const body = await res.json();
        assert.equal(body.conversations.find((c) => c.username === HER).unreadCount, 0);
    });

    await t.test('typing reaches the other person', async () => {
        const started = nextEvent(himSocket, 'typing:start');
        herSocket.emit('typing:start', { receiver: HIM });

        const payload = await started;
        assert.equal(payload.sender, HER);

        const stopped = nextEvent(himSocket, 'typing:stop');
        herSocket.emit('typing:stop', { receiver: HIM });
        assert.equal((await stopped).sender, HER);
    });

    /**
     * The indicator that sticks forever. The client never sends a stop event
     * here — the server must give up on her behalf.
     */
    await t.test('a typing indicator expires without a stop event', async () => {
        const started = nextEvent(himSocket, 'typing:start');
        herSocket.emit('typing:start', { receiver: HIM });
        await started;

        const expired = await nextEvent(himSocket, 'typing:stop', 6000);
        assert.equal(expired.sender, HER, 'the server should stop it after ~3s of silence');
    });

    /**
     * The multi-tab bug: the old code stored one socket id per person, so a
     * second tab silenced the first and closing either marked them offline.
     */
    await t.test('both of one person\'s tabs receive a message', async () => {
        const secondTab = await openSocket(himToken);

        const matches = (m) => m.text === 'to every tab';
        const onFirst = nextEvent(himSocket, 'message:new', 5000, matches);
        const onSecond = nextEvent(secondTab, 'message:new', 5000, matches);

        herSocket.emit('message:send', { receiver: HIM, text: 'to every tab', type: 'text' });

        const [first, second] = await Promise.all([onFirst, onSecond]);
        assert.equal(first.text, 'to every tab');
        assert.equal(second.text, 'to every tab', 'a second tab must not silence the first');

        secondTab.close();
    });

    await t.test('closing one tab leaves the person online', async () => {
        const secondTab = await openSocket(himToken);
        await new Promise((r) => setTimeout(r, 300));

        secondTab.close();
        await new Promise((r) => setTimeout(r, 500));

        const res = await fetch(`${BASE}/api/chat/conversations`, {
            headers: { Authorization: `Bearer ${herToken}` },
        });
        const body = await res.json();
        const him = body.conversations.find((c) => c.username === HIM);

        assert.equal(him.isOnline, true, 'his other tab is still open, so he is still here');
    });

    await t.test('a reaction reaches both of them', async () => {
        const arrival = nextEvent(himSocket, 'message:new', 5000, (m) => m.text === 'react to this');
        herSocket.emit('message:send', { receiver: HIM, text: 'react to this', type: 'text' });
        const message = await arrival;

        const onHers = nextEvent(herSocket, 'reaction:updated', 5000, (r) => r.messageId === message._id);
        const onHis = nextEvent(himSocket, 'reaction:updated', 5000, (r) => r.messageId === message._id);

        himSocket.emit('reaction:toggle', { messageId: message._id, emoji: '\u2764\ufe0f' });

        const [hers, his] = await Promise.all([onHers, onHis]);
        assert.equal(hers.reactions.length, 1, 'she should see he reacted');
        assert.equal(hers.reactions[0].username, HIM);
        assert.equal(his.reactions.length, 1, 'and so should he');
    });

    await t.test('reacting the same way again takes it back', async () => {
        const arrival = nextEvent(himSocket, 'message:new', 5000, (m) => m.text === 'take it back');
        herSocket.emit('message:send', { receiver: HIM, text: 'take it back', type: 'text' });
        const message = await arrival;

        const added = nextEvent(himSocket, 'reaction:updated', 5000,
            (r) => r.messageId === message._id && r.reactions.length === 1);
        himSocket.emit('reaction:toggle', { messageId: message._id, emoji: '\ud83d\ude02' });
        await added;

        const removed = nextEvent(himSocket, 'reaction:updated', 5000,
            (r) => r.messageId === message._id && r.reactions.length === 0);
        himSocket.emit('reaction:toggle', { messageId: message._id, emoji: '\ud83d\ude02' });

        assert.deepEqual((await removed).reactions, []);
    });

    await t.test('a reaction is persisted, not merely broadcast', async () => {
        await mongoose.connect(MONGO_URI);
        const withReactions = await mongoose.connection.collection('messages')
            .countDocuments({ 'reactions.0': { $exists: true } });
        await mongoose.disconnect();

        assert.ok(withReactions >= 1, 'it must still be there after a reload');
    });

    await t.test('a reply carries what it is replying to', async () => {
        const first = nextEvent(himSocket, 'message:new', 5000, (m) => m.text === 'remember that day?');
        herSocket.emit('message:send', { receiver: HIM, text: 'remember that day?', type: 'text' });
        const original = await first;

        himSocket.emit('message:send', {
            receiver: HER,
            text: 'YESSS',
            type: 'text',
            replyTo: { messageId: original._id, sender: HER, text: 'remember that day?', type: 'text' },
        });

        // She sees his reply arrive with the quote attached.
        const arrived = await nextEvent(herSocket, 'message:new', 5000, (m) => m.text === 'YESSS');
        assert.ok(arrived.replyTo, 'the quoted message should travel with the reply');
        assert.equal(arrived.replyTo.text, 'remember that day?');
        assert.equal(arrived.replyTo.sender, HER);
    });

    await t.test('presence updates are broadcast when someone leaves', async () => {
        const extraToken = await login(HIM, HIS_PASSWORD);
        const temporary = await openSocket(extraToken);
        await new Promise((r) => setTimeout(r, 200));

        const update = nextEvent(herSocket, 'presence:update', 4000);
        temporary.close();
        himSocket.close();

        const payload = await update;
        assert.equal(payload.username, HIM);
    });
});
