'use strict';

/**
 * Two server instances, one Redis.
 *
 * Rooms are what make this possible — nothing in the application code knows or
 * cares how many processes there are. This proves that, and the control case
 * proves the adapter is genuinely doing the work rather than the test passing
 * by accident.
 *
 * Needs Redis as well as MongoDB:
 *   docker run -d --name wg-test-redis -p 6380:6379 redis:7-alpine
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const mongoose = require('mongoose');
const { io: connect } = require('socket.io-client');

const { isReachable, SKIP_MESSAGE } = require('./requireMongo');

const MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27018/wg_scaling_test';
const REDIS_URL = process.env.TEST_REDIS_URL || 'redis://127.0.0.1:6380';

const HER = 'radhe';
const HER_PASSWORD = 'her-secret-password';
const HIM = 'govind';
const HIS_PASSWORD = 'his-different-password';

const children = [];

function envFor(port, redisUrl) {
    return {
        ...process.env,
        MONGO_URI,
        PORT: String(port),
        JWT_SECRET: 'scaling-test-secret',
        MASTER_PASSWORD: 'legacy-master',
        USER_A_NAME: HER,
        USER_A_PASSWORD: HER_PASSWORD,
        USER_B_NAME: HIM,
        USER_B_PASSWORD: HIS_PASSWORD,
        CLOUDINARY_CLOUD_NAME: 'unused',
        CLOUDINARY_API_KEY: 'unused',
        CLOUDINARY_API_SECRET: 'unused',
        // Always set, so dotenv cannot supply one from backend/.env; empty means no Redis.
        REDIS_URL: redisUrl || '',
    };
}

async function startInstance(port, redisUrl) {
    const child = spawn('node', ['server.js'], {
        cwd: path.join(__dirname, '..', '..'),
        env: envFor(port, redisUrl),
        stdio: ['ignore', 'ignore', 'pipe'],
    });
    child.stderr.on('data', (d) => process.stderr.write(`[:${port}] ${d}`));
    children.push(child);

    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        try {
            if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return child;
        } catch { /* not up yet */ }
        await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`instance on ${port} did not become healthy`);
}

function stopAll() {
    while (children.length) children.pop().kill('SIGKILL');
}

const login = async (port, username, password) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/verify-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
    });
    const body = await res.json();
    assert.equal(body.success, true, `login failed for ${username}`);
    return body.token;
};

function openSocket(port, token) {
    const socket = connect(`http://127.0.0.1:${port}`, {
        auth: { token }, transports: ['websocket'], forceNew: true,
    });
    return new Promise((resolve, reject) => {
        socket.on('connect', () => resolve(socket));
        socket.on('connect_error', reject);
    });
}

function waitFor(socket, event, timeoutMs, match) {
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

test('two instances behind one Redis', async (t) => {
    if (!(await isReachable(MONGO_URI))) return t.skip(SKIP_MESSAGE);
    if (!(await isReachable(REDIS_URL))) {
        return t.skip('needs Redis: docker run -d --name wg-test-redis -p 6380:6379 redis:7-alpine');
    }

    await mongoose.connect(MONGO_URI);
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();

    t.after(stopAll);

    /**
     * The control. Without the adapter each process only knows about its own
     * sockets, so a message cannot cross — which is exactly the bug the old
     * socketId-on-the-user-document design would have had at any scale.
     */
    await t.test('without Redis, a message cannot cross between instances', async () => {
        await startInstance(5081, null);
        await startInstance(5082, null);

        const herToken = await login(5081, HER, HER_PASSWORD);
        const himToken = await login(5082, HIM, HIS_PASSWORD);

        const her = await openSocket(5081, herToken);
        const him = await openSocket(5082, himToken);

        const arrival = waitFor(him, 'message:new', 2500, (m) => m.text === 'across the gap');
        her.emit('message:send', { receiver: HIM, text: 'across the gap', type: 'text' });

        await assert.rejects(
            () => arrival,
            'with no shared adapter the other instance never hears about it'
        );

        her.close();
        him.close();
        stopAll();
    });

    await t.test('with Redis, it arrives', async () => {
        await startInstance(5083, REDIS_URL);
        await startInstance(5084, REDIS_URL);

        const herToken = await login(5083, HER, HER_PASSWORD);
        const himToken = await login(5084, HIM, HIS_PASSWORD);

        const her = await openSocket(5083, herToken);
        const him = await openSocket(5084, himToken);

        const arrival = waitFor(him, 'message:new', 8000, (m) => m.text === 'across the gap');
        her.emit('message:send', { receiver: HIM, text: 'across the gap', type: 'text' });

        const received = await arrival;
        assert.equal(received.sender, HER);
        assert.equal(received.text, 'across the gap');

        her.close();
        him.close();
    });

    await t.test('typing crosses instances too', async () => {
        const herToken = await login(5083, HER, HER_PASSWORD);
        const himToken = await login(5084, HIM, HIS_PASSWORD);

        const her = await openSocket(5083, herToken);
        const him = await openSocket(5084, himToken);

        const typing = waitFor(him, 'typing:start', 8000, (p) => p.sender === HER);
        her.emit('typing:start', { receiver: HIM });

        assert.equal((await typing).sender, HER);

        her.close();
        him.close();
    });

    await t.test('the same person on both instances gets the message on both', async () => {
        const herToken = await login(5083, HER, HER_PASSWORD);
        const himToken = await login(5084, HIM, HIS_PASSWORD);

        const her = await openSocket(5083, herToken);
        const hisPhone = await openSocket(5083, himToken);   // his phone hits instance one
        const hisLaptop = await openSocket(5084, himToken);  // his laptop hits instance two

        const matches = (m) => m.text === 'to every device';
        const onPhone = waitFor(hisPhone, 'message:new', 8000, matches);
        const onLaptop = waitFor(hisLaptop, 'message:new', 8000, matches);

        her.emit('message:send', { receiver: HIM, text: 'to every device', type: 'text' });

        const [phone, laptop] = await Promise.all([onPhone, onLaptop]);
        assert.equal(phone.text, 'to every device');
        assert.equal(laptop.text, 'to every device', 'the room spans both processes');

        her.close();
        hisPhone.close();
        hisLaptop.close();
    });
});
