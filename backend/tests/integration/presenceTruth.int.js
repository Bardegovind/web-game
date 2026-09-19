'use strict';

/**
 * "govind sees radhe online; radhe sees govind offline" — while both of them
 * are sitting right there.
 *
 * The list of who is here, handed to each person as they arrive, came from a
 * stored flag. Anything that wrote that flag wrongly made the arrival see the
 * other person as gone. The realistic way it happens: two server processes on
 * one database — a local `npm start` next to the live site — where the second
 * one's boot clears the flags of everyone it cannot see. Real servers, real
 * sockets, real Mongo.
 *
 * Ports 5088 and 5089.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const mongoose = require('mongoose');
const { io: connect } = require('socket.io-client');

const { isReachable, SKIP_MESSAGE } = require('./requireMongo');

const MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27018/wg_presence_truth_test';
const MASTER = 'the-one-password';
const HER = 'radhe';
const HIM = 'govind';

const envFor = (port) => ({
    ...process.env,
    MONGO_URI,
    PORT: String(port),
    JWT_SECRET: 'presence-truth-secret',
    MASTER_PASSWORD: MASTER,
    USER_A_NAME: '',
    USER_A_PASSWORD: '',
    USER_B_NAME: '',
    USER_B_PASSWORD: '',
    CLOUDINARY_CLOUD_NAME: 'unused',
    CLOUDINARY_API_KEY: 'unused',
    CLOUDINARY_API_SECRET: 'unused',
    REDIS_URL: '',
});

const children = [];

async function startServer(port) {
    const child = spawn('node', ['server.js'], {
        cwd: path.join(__dirname, '..', '..'),
        env: envFor(port),
        stdio: ['ignore', 'ignore', 'pipe'],
    });
    child.stderr.on('data', (d) => process.stderr.write(`[server:${port}] ${d}`));
    children.push(child);

    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        try {
            if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return;
        } catch { /* not up yet */ }
        await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`server on ${port} did not become healthy`);
}

async function tokenFor(port, username) {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/verify-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: MASTER }),
    });
    return (await res.json()).token;
}

/** Connects, and resolves with the socket and the first online list it is handed. */
function arrive(port, token) {
    const socket = connect(`http://127.0.0.1:${port}`, { auth: { token }, transports: ['websocket'], forceNew: true });
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('no online list within 5s')), 5000);
        socket.once('users:online', (users) => {
            clearTimeout(timer);
            resolve({ socket, listed: users.map((u) => u.username) });
        });
        socket.on('connect_error', reject);
    });
}

async function storedFlag(username) {
    await mongoose.connect(MONGO_URI);
    const row = await mongoose.connection.db.collection('chamberusers').findOne({ username });
    await mongoose.disconnect();
    return row ? row.isOnline : undefined;
}

test('who is here, as each of them sees it', async (t) => {
    if (!(await isReachable(MONGO_URI))) return t.skip(SKIP_MESSAGE);

    await mongoose.connect(MONGO_URI);
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();

    t.after(() => { for (const child of children) child.kill('SIGKILL'); });

    await startServer(5088);
    const him = await arrive(5088, await tokenFor(5088, HIM));
    t.after(() => him.socket.close());
    await new Promise((r) => setTimeout(r, 300));

    await t.test('a second server on the same database wipes his stored flag at boot', async () => {
        assert.equal(await storedFlag(HIM), true, 'he is stored as online to begin with');

        await startServer(5089); // boots, sees none of his sockets, clears his flag

        assert.equal(await storedFlag(HIM), false, 'the second server has written him off');
    });

    await t.test('she arrives where he is, and is told he is here', async () => {
        const her = await arrive(5088, await tokenFor(5088, HER));
        t.after(() => her.socket.close());

        assert.ok(
            her.listed.includes(HIM),
            `he is connected to this server, so she must see him: she was told ${JSON.stringify(her.listed)}`
        );
    });
});
