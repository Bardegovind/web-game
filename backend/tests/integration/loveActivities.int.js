'use strict';

/**
 * The three love activities, against a real server and a real database.
 *
 * Us, the jar of reasons, and a nudge that reaches her — end to end: auth
 * required, ownership respected, the 60 second throttle, and the socket event
 * actually arriving at the recipient's room.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const mongoose = require('mongoose');
const { io: connect } = require('socket.io-client');

const { isReachable, SKIP_MESSAGE } = require('./requireMongo');

const MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27018/wg_love_test';
const PORT = 5086;
const BASE = `http://127.0.0.1:${PORT}`;

const HER = 'radhe';
const HER_PASSWORD = 'her-secret-password';
const HIM = 'govind';
const HIS_PASSWORD = 'his-different-password';

const SERVER_ENV = {
    ...process.env,
    MONGO_URI,
    PORT: String(PORT),
    JWT_SECRET: 'love-activities-test-secret',
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

function openSocket(token) {
    const socket = connect(BASE, { auth: { token }, transports: ['websocket'], forceNew: true });
    return new Promise((resolve, reject) => {
        socket.on('connect', () => resolve(socket));
        socket.on('connect_error', reject);
    });
}

function nextEvent(socket, event, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs);
        socket.once(event, (payload) => {
            clearTimeout(timer);
            resolve(payload);
        });
    });
}

test('love activities', async (t) => {
    if (!(await isReachable(MONGO_URI))) return t.skip(SKIP_MESSAGE);

    await mongoose.connect(MONGO_URI);
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();

    await startServer();
    t.after(() => { if (child) child.kill('SIGKILL'); });

    const herToken = await login(HER, HER_PASSWORD);
    const himToken = await login(HIM, HIS_PASSWORD);

    await t.test('none of it is reachable without signing in', async () => {
        for (const url of ['/api/chamber/us', '/api/chamber/reasons', '/api/chamber/nudge/pending']) {
            const res = await fetch(`${BASE}${url}`);
            assert.equal(res.status, 401, `${url} must require the password`);
        }
    });

    await t.test('with nothing set yet, "us" falls back to today', async () => {
        const { status, body } = await call(herToken, 'GET', '/api/chamber/us');

        assert.equal(status, 200);
        assert.equal(body.source, 'today');
        assert.ok(body.startDate);
        assert.equal(body.daysTogether, 0);
        assert.ok(body.nextAnniversary.date);
    });

    await t.test('setting the date is what both of them see afterwards', async () => {
        const set = await call(himToken, 'PUT', '/api/chamber/us', { date: '2024-01-01' });

        assert.equal(set.status, 200);
        assert.equal(set.body.source, 'set');
        assert.equal(new Date(set.body.startDate).toISOString().slice(0, 10), '2024-01-01');

        const seenByHer = await call(herToken, 'GET', '/api/chamber/us');
        assert.equal(seenByHer.body.source, 'set');
        assert.equal(new Date(seenByHer.body.startDate).toISOString().slice(0, 10), '2024-01-01');
        assert.ok(seenByHer.body.daysTogether > 0, 'time has passed since 2024');
    });

    await t.test('a date that has not happened yet is refused', async () => {
        const { status, body } = await call(himToken, 'PUT', '/api/chamber/us', { date: '2999-01-01' });

        assert.equal(status, 400);
        assert.ok(body.message.length > 0);
    });

    await t.test('a nonsense date is refused, not stored', async () => {
        const { status } = await call(himToken, 'PUT', '/api/chamber/us', { date: 'not a date' });
        assert.equal(status, 400);

        const still = await call(himToken, 'GET', '/api/chamber/us');
        assert.equal(new Date(still.body.startDate).toISOString().slice(0, 10), '2024-01-01');
    });

    await t.test('two saves at once leave one date, not two rows', async () => {
        // An empty upsert filter used to let each of two simultaneous saves
        // decide nothing matched, so both inserted, and later reads could
        // return either row.
        const [his, hers] = await Promise.all([
            call(himToken, 'PUT', '/api/chamber/us', { date: '2024-01-01' }),
            call(herToken, 'PUT', '/api/chamber/us', { date: '2024-01-01' }),
        ]);

        assert.equal(his.status, 200);
        assert.equal(hers.status, 200);

        await mongoose.connect(MONGO_URI);
        const rows = await mongoose.connection.db.collection('relationships').countDocuments();
        await mongoose.disconnect();

        assert.equal(rows, 1, 'one relationship, one row, whatever the timing');

        const seen = await call(herToken, 'GET', '/api/chamber/us');
        assert.equal(new Date(seen.body.startDate).toISOString().slice(0, 10), '2024-01-01');
    });

    await t.test('the time of day they met is kept, not rounded away to midnight', async () => {
        // "17 April 2024, 1:46 pm" is how a couple remembers it. Storing only
        // the date would quietly lose half of what they told us.
        const set = await call(himToken, 'PUT', '/api/chamber/us', { date: '2024-04-17T13:46:00' });
        assert.equal(set.status, 200);

        const saved = new Date(set.body.startDate);
        assert.equal(saved.getHours(), 13);
        assert.equal(saved.getMinutes(), 46);

        const seenByHer = new Date((await call(herToken, 'GET', '/api/chamber/us')).body.startDate);
        assert.equal(seenByHer.getHours(), 13, 'she sees the same minute he saved');
        assert.equal(seenByHer.getMinutes(), 46);
    });

    await t.test('the count is still whole days, whatever the clock says', async () => {
        const { body } = await call(herToken, 'GET', '/api/chamber/us');

        const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const expected = Math.round((midnight(new Date()) - midnight(new Date(2024, 3, 17))) / 86400000);

        assert.equal(body.daysTogether, expected, 'an afternoon start is not most of a day short');
        assert.equal(new Date(body.nextAnniversary.date).getMonth(), 3, 'the anniversary is still in April');
        assert.equal(new Date(body.nextAnniversary.date).getDate(), 17);
    });

    let firstReasonId = null;

    await t.test('the jar: either of them can add, both can see', async () => {
        const first = await call(himToken, 'POST', '/api/chamber/reasons', {
            text: 'the way you laugh at your own jokes first',
        });
        assert.equal(first.status, 201);
        assert.equal(first.body.reason.author, HIM);
        firstReasonId = first.body.reason._id;

        await call(herToken, 'POST', '/api/chamber/reasons', { text: 'you make terrible tea and I love it' });

        const { body } = await call(herToken, 'GET', '/api/chamber/reasons');
        assert.equal(body.reasons.length, 2);
        assert.equal(body.reasons[0].text, 'you make terrible tea and I love it', 'newest first');
    });

    await t.test('only whoever wrote a reason can take it out of the jar', async () => {
        const wrongPerson = await call(herToken, 'DELETE', `/api/chamber/reasons/${firstReasonId}`);
        assert.equal(wrongPerson.status, 404);

        const stillThere = await call(himToken, 'GET', '/api/chamber/reasons');
        assert.equal(stillThere.body.reasons.length, 2, 'her attempt must not have removed it');

        const rightPerson = await call(himToken, 'DELETE', `/api/chamber/reasons/${firstReasonId}`);
        assert.equal(rightPerson.status, 200);

        const after = await call(himToken, 'GET', '/api/chamber/reasons');
        assert.equal(after.body.reasons.length, 1);
    });

    await t.test('an empty or oversized reason is refused', async () => {
        const empty = await call(himToken, 'POST', '/api/chamber/reasons', { text: '   ' });
        assert.equal(empty.status, 400);

        const tooLong = await call(himToken, 'POST', '/api/chamber/reasons', { text: 'x'.repeat(201) });
        assert.equal(tooLong.status, 400);
    });

    await t.test('today carries days together, the next anniversary and the reason of the day', async () => {
        const { body } = await call(herToken, 'GET', '/api/chamber/today');

        assert.equal(typeof body.today.daysTogether, 'number');
        assert.ok(body.today.daysTogether > 0);
        assert.ok(body.today.nextAnniversary.date);
        assert.equal(typeof body.today.nextAnniversary.daysAway, 'number');
        assert.equal(body.today.reasonOfTheDay.text, 'you make terrible tea and I love it');
        assert.equal(body.today.reasonOfTheDay.author, HER);
        assert.equal(body.today.pendingNudge, null, 'nothing has been sent yet');
    });

    await t.test('nobody is connected yet, and the nudge still sends; a second one right after is throttled', async () => {
        const first = await call(himToken, 'POST', '/api/chamber/nudge');
        assert.equal(first.status, 200);
        assert.equal(first.body.sent, true, 'a nudge is stored and waiting even with no live socket to deliver it to');

        const second = await call(himToken, 'POST', '/api/chamber/nudge');
        assert.equal(second.status, 429);
        assert.equal(second.body.sent, false);
        assert.equal(second.body.reason, 'too-soon');
    });

    await t.test('the nudge reaches her pending list', async () => {
        const { body } = await call(herToken, 'GET', '/api/chamber/nudge/pending');

        assert.equal(body.nudges.length, 1);
        assert.equal(body.nudges[0].from, HIM);
    });

    await t.test('today now shows the pending nudge', async () => {
        const { body } = await call(herToken, 'GET', '/api/chamber/today');

        assert.ok(body.today.pendingNudge);
        assert.equal(body.today.pendingNudge.from, HIM);
    });

    await t.test('marking seen clears it everywhere', async () => {
        const marked = await call(herToken, 'POST', '/api/chamber/nudge/seen');
        assert.equal(marked.body.seen, 1);

        const pending = await call(herToken, 'GET', '/api/chamber/nudge/pending');
        assert.equal(pending.body.nudges.length, 0);

        const today = await call(herToken, 'GET', '/api/chamber/today');
        assert.equal(today.body.today.pendingNudge, null);
    });

    await t.test('a nudge reaches a connected recipient live, over the socket', async () => {
        const himSocket = await openSocket(himToken);
        t.after(() => himSocket.close());

        const arrival = nextEvent(himSocket, 'nudge:new');

        // Her cooldown is independent of his, so this is her first send.
        const sent = await call(herToken, 'POST', '/api/chamber/nudge');
        assert.equal(sent.body.sent, true);

        const payload = await arrival;
        assert.equal(payload.from, HER);
        assert.ok(payload.createdAt);
    });
});
