'use strict';

/**
 * Presence reconciliation on boot, against a real MongoDB and a real Socket.IO
 * server.
 *
 * Nothing resets `ChamberUser.isOnline` when the process starts. If it stops
 * while someone is connected — a restart, a crash, a deploy — `disconnected`
 * never runs, and that person is stored online forever. This proves a fresh
 * boot clears anyone with no live socket, and leaves anyone who genuinely still
 * has one.
 *
 * Needs the throwaway MongoDB: docker run -d --name wg-test-mongo -p 27018:27017 mongo:7
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const { io: connect } = require('socket.io-client');

const { isReachable, SKIP_MESSAGE } = require('./requireMongo');
const { roomFor } = require('../../socket/events');
const { createPresenceService } = require('../../services/presence.service');
const ChamberUser = require('../../models/ChamberUser');

const MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27018/wg_presence_int';
const PORT = 5097;
const BASE = `http://127.0.0.1:${PORT}`;

const HER = 'radhe';
const HER_PASSWORD = 'her-secret-password';
const HIM = 'govind';
const HIS_PASSWORD = 'his-different-password';

const SERVER_ENV = {
    ...process.env,
    MONGO_URI,
    PORT: String(PORT),
    JWT_SECRET: 'presence-integration-secret',
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

function stopServer() {
    if (child) child.kill('SIGKILL');
    child = null;
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

test('presence reconciliation on boot', async (t) => {
    if (!(await isReachable(MONGO_URI))) return t.skip(SKIP_MESSAGE);

    await mongoose.connect(MONGO_URI);
    await mongoose.connection.db.dropDatabase();

    t.after(async () => {
        stopServer();
        await mongoose.disconnect();
    });

    /**
     * The direct-restart case: nothing here goes through the spawned server.
     * A `ChamberUser` document is planted as stored online, exactly the state
     * left behind when a process stops mid-session, and reconciliation is
     * called directly against the real Mongo connection and the real
     * `isOnline` room check.
     */
    await t.test('a live socket keeps its user online across reconciliation, a dead one does not', async () => {
        await ChamberUser.create({ username: HER, isOnline: true });
        await ChamberUser.create({ username: HIM, isOnline: true });

        const httpServer = http.createServer();
        const io = new Server(httpServer);
        io.on('connection', (socket) => {
            socket.join(roomFor(socket.handshake.query.username));
        });

        await new Promise((resolve) => httpServer.listen(0, resolve));
        const { port } = httpServer.address();

        // Only HIM has a real, live socket. HER is stored online with nothing
        // behind it — the stale-flag-after-restart case.
        const hisSocket = connect(`http://127.0.0.1:${port}`, {
            query: { username: HIM },
            transports: ['websocket'],
            forceNew: true,
        });

        try {
            await new Promise((resolve, reject) => {
                hisSocket.on('connect', resolve);
                hisSocket.on('connect_error', reject);
            });

            const presence = createPresenceService({ io, ChamberUser });
            const cleared = await presence.reconcileStoredPresence();

            assert.equal(cleared, 1, 'only the user with no live socket should be cleared');

            const her = await ChamberUser.findOne({ username: HER }).lean();
            assert.equal(her.isOnline, false, 'stored online with no live socket must be cleared');
            assert.ok(
                Date.now() - new Date(her.lastSeen).getTime() < 10000,
                'lastSeen should be stamped to the time of reconciliation'
            );

            const him = await ChamberUser.findOne({ username: HIM }).lean();
            assert.equal(him.isOnline, true, 'a genuinely live socket must be left online');
        } finally {
            hisSocket.close();
            io.close();
            await new Promise((resolve) => httpServer.close(resolve));
        }
    });

    /**
     * The real bug, reproduced end to end: a `ChamberUser` is planted stored
     * online exactly as a crashed or restarted process would leave it, then the
     * actual server.js is booted. RED (before the fix) leaves this `true`.
     */
    await t.test('a fresh server boot clears the stale flag and the API reflects it', async () => {
        await ChamberUser.deleteMany({});
        await ChamberUser.create({ username: HER, isOnline: true, lastSeen: new Date('2020-01-01') });

        await startServer();

        const her = await ChamberUser.findOne({ username: HER }).lean();
        assert.equal(her.isOnline, false, 'a restart must not leave the stale flag standing');
        assert.ok(
            Date.now() - new Date(her.lastSeen).getTime() < 20000,
            'lastSeen should be recent, stamped by reconciliation rather than left at its old value'
        );

        const himToken = await login(HIM, HIS_PASSWORD);
        const res = await fetch(`${BASE}/api/chat/conversations`, {
            headers: { Authorization: `Bearer ${himToken}` },
        });
        const body = await res.json();
        const her2 = body.conversations.find((c) => c.username === HER);

        assert.ok(her2, 'radhe should still appear as a conversation');
        assert.equal(her2.isOnline, false, 'the conversation list must not show a false green dot');
    });
});
