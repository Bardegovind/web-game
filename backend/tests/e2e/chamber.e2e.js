'use strict';

/**
 * The whole thing, end to end, exactly as she would meet it.
 *
 * Real server, real database, the real built frontend, real Chrome, and real
 * pointer input on the three hidden corners — no stubs anywhere. This is the
 * test that proves the React chamber did not break the ritual.
 *
 * Run: npm run test:e2e (needs a test MongoDB and a built frontend)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const mongoose = require('mongoose');
const { chromium } = require('playwright-core');
const { io: connect } = require('socket.io-client');

const { isReachable, SKIP_MESSAGE } = require('../integration/requireMongo');

const MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27018/wg_chamber_e2e';
const PORT = 5096;
const BASE = `http://127.0.0.1:${PORT}`;
const CHROME = '/usr/bin/google-chrome';
const DIST = path.join(__dirname, '..', '..', '..', 'frontend', 'dist', 'index.html');

const HER = 'radhe';
const HER_PASSWORD = 'her-secret-password';
const HIM = 'govind';
const HIS_PASSWORD = 'his-different-password';

const SERVER_ENV = {
    ...process.env,
    MONGO_URI,
    PORT: String(PORT),
    JWT_SECRET: 'chamber-e2e-secret',
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

/** Performs the frozen ritual with real pointer input: 16, then 3, then 7. */
async function performRitual(page) {
    for (const [zone, times] of [[1, 16], [2, 3], [3, 7]]) {
        const box = await page.locator(`[data-tap="${zone}"]`).boundingBox();
        assert.ok(box, `corner ${zone} should be laid out`);

        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        for (let i = 0; i < times; i++) {
            await page.mouse.click(x, y, { delay: 4 });
            await page.waitForTimeout(35);
        }
    }
}

async function signIn(page, username, password) {
    await page.waitForSelector('#password-modal.show', { timeout: 4000 });
    await page.fill('#input-username', username);
    await page.fill('#input-password', password);
    await page.click('#btn-submit-password');
}

let peerToken = null;

/** A second person, connected over a real socket, to send from the other side. */
async function otherPerson(username, password) {
    const res = await fetch(`${BASE}/api/auth/verify-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
    });
    const { token } = await res.json();
    peerToken = token;

    const socket = connect(BASE, { auth: { token }, transports: ['websocket'], forceNew: true });
    await new Promise((resolve, reject) => {
        socket.on('connect', resolve);
        socket.on('connect_error', reject);
    });
    return socket;
}

test('the chamber, end to end', async (t) => {
    if (!(await isReachable(MONGO_URI))) return t.skip(SKIP_MESSAGE);
    if (!fs.existsSync(DIST)) return t.skip('needs a built frontend: cd frontend && npm run build');

    await mongoose.connect(MONGO_URI);
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();

    await startServer();

    const browser = await chromium.launch({ executablePath: CHROME });
    const page = await browser.newPage({ viewport: { width: 1180, height: 860 } });

    // Anything the page throws is a failure, not noise.
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    let peerSocket = null;

    t.after(async () => {
        peerSocket?.close();
        await browser.close();
        if (child) child.kill('SIGKILL');
    });

    await page.goto(BASE);
    await page.waitForSelector('#board .cell');

    await t.test('the game is what anyone else would find', async () => {
        assert.equal(await page.locator('#chamber-root').innerText(), '', 'the chamber must not be rendered yet');
        assert.equal(await page.title(), 'Tic Tac Toe');
    });

    await t.test('the frozen ritual still opens the password prompt', async () => {
        await performRitual(page);
        await page.waitForSelector('#password-modal.show', { timeout: 4000 });
    });

    await t.test('the right password opens the chamber', async () => {
        await signIn(page, HER, HER_PASSWORD);

        // The entrance plays once, then the room is there.
        await page.waitForSelector('text=ours', { timeout: 8000 });
        await page.waitForTimeout(1600);

        assert.ok(
            (await page.locator('#chamber-root').innerText()).includes('ours'),
            'the chamber should be on screen'
        );
    });

    await t.test('the other person appears in the conversation list', async () => {
        // The chamber opens on `today` now, so the conversations live a tab away.
        await page.locator('nav button').filter({ hasText: 'messages' }).first().click();
        await page.waitForSelector(`text=${HIM}`, { timeout: 6000 });
    });

    await t.test('opening the conversation shows it', async () => {
        await page.locator('li button').filter({ hasText: HIM }).first().click();
        await page.waitForSelector('textarea', { timeout: 6000 });
    });

    await t.test('a message sent from the other side arrives live', async () => {
        peerSocket = await otherPerson(HIM, HIS_PASSWORD);

        peerSocket.emit('message:send', {
            receiver: HER,
            text: 'i made something for you',
            type: 'text',
            clientId: 'peer-1',
        });

        await page.waitForSelector('text=i made something for you', { timeout: 6000 });
    });

    /**
     * React escapes text content, so this should be impossible — which is
     * exactly why it is worth asserting rather than assuming.
     */
    await t.test('a hostile message renders as text and does not execute', async () => {
        await page.evaluate(() => { window.__executed = undefined; });

        peerSocket.emit('message:send', {
            receiver: HER,
            text: '<img src=x onerror="window.__executed = true">',
            type: 'text',
            clientId: 'peer-hostile',
        });

        await page.waitForSelector('text=onerror', { timeout: 6000 });
        await page.waitForTimeout(400);

        assert.equal(
            await page.evaluate(() => window.__executed),
            undefined,
            'injected script must not run — it could read the token that guards the chamber'
        );
    });

    await t.test('times read without a leading zero', async () => {
        const times = await page.locator('.font-display').allInnerTexts();
        assert.ok(times.length > 0, 'the chamber should be rendering');

        const body = await page.locator('#chamber-root').innerText();
        assert.ok(/\d{1,2}:\d{2}\s(AM|PM)/.test(body), 'a readable clock time should be shown');
        assert.ok(!/\b0\d:\d{2}\s(AM|PM)/.test(body), 'no leading-zero times');
    });

    await t.test('the day is announced so the history cannot read as scrambled', async () => {
        const body = await page.locator('#chamber-root').innerText();
        assert.ok(body.includes('Today'), 'today\'s messages should sit under a Today heading');
    });

    await t.test('she can react to a message and it sticks', async () => {
        const bubble = page.locator('.group').filter({ hasText: 'i made something for you' }).first();
        await bubble.hover();
        await bubble.locator('[aria-label="React"]').click();

        await page.locator('button').filter({ hasText: '\u2764\ufe0f' }).last().click();
        await page.waitForTimeout(600);

        const body = await page.locator('#chamber-root').innerText();
        assert.ok(body.includes('\u2764\ufe0f'), 'the reaction should show on the message');
    });

    await t.test('replying quotes what it is replying to', async () => {
        const bubble = page.locator('.group').filter({ hasText: 'i made something for you' }).first();
        await bubble.hover();
        await bubble.locator('[aria-label="Reply"]').click();

        await page.waitForSelector('text=Replying to', { timeout: 4000 });

        await page.fill('textarea', 'YESSS');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(900);

        const body = await page.locator('#chamber-root').innerText();
        assert.ok(body.includes('YESSS'), 'the reply should send');
        assert.ok(!body.includes('Replying to'), 'and the quote bar should clear');
    });

    await t.test('today opens with what is waiting', async () => {
        await page.locator('nav button').filter({ hasText: 'today' }).first().click();
        await page.waitForSelector('text=Today\'s question', { timeout: 6000 });

        const body = await page.locator('#chamber-root').innerText();
        assert.ok(body.includes('waiting for you') || body.includes('caught up'),
            'it should say whether anything is waiting');
    });

    await t.test('she can answer the question and see it recorded', async () => {
        await page.fill('input[placeholder="Your answer"]', 'somewhere with no signal');
        await page.locator('button').filter({ hasText: 'Answer' }).first().click();

        await page.waitForSelector('text=You said', { timeout: 6000 });
        const body = await page.locator('#chamber-root').innerText();
        assert.ok(body.includes('somewhere with no signal'), 'her answer should be shown back to her');
    });

    /** The whole idea depends on not being able to peek. */
    await t.test('a letter waiting for her does not give itself away', async () => {
        await fetch(`${BASE}/api/chamber/letters`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${peerToken}` },
            body: JSON.stringify({
                prompt: 'Open when you miss me',
                body: 'THE-SECRET-CONTENTS',
            }),
        });

        await page.locator('nav button').filter({ hasText: 'letters' }).first().click();
        await page.waitForSelector('text=Open when you miss me', { timeout: 6000 });

        const body = await page.locator('#chamber-root').innerText();
        assert.ok(body.includes('Not opened yet'));
        assert.ok(!body.includes('THE-SECRET-CONTENTS'), 'an unopened letter must keep its contents');
    });

    await t.test('opening the letter reveals it', async () => {
        await page.locator('button').filter({ hasText: 'Open when you miss me' }).first().click();
        await page.waitForSelector('text=THE-SECRET-CONTENTS', { timeout: 6000 });

        await page.keyboard.press('Escape').catch(() => {});
        await page.locator('[aria-label="Close"]').first().click();
    });

    await t.test('the shared list can be added to and ticked off', async () => {
        await page.locator('nav button').filter({ hasText: 'list' }).first().click();
        await page.waitForSelector('input[placeholder="Something we should do"]', { timeout: 6000 });

        await page.fill('input[placeholder="Something we should do"]', 'Watch the sunrise together');
        await page.locator('[aria-label="Add to the list"]').click();
        await page.waitForSelector('text=Watch the sunrise together', { timeout: 6000 });

        await page.locator('button').filter({ hasText: 'Watch the sunrise together' }).first().click();
        await page.waitForSelector('text=1 of 1', { timeout: 6000 });
    });

    await t.test('the story reads forwards', async () => {
        for (const entry of [
            { title: 'The beginning', happenedAt: '2025-03-29', emoji: '\u2661' },
            { title: 'That day', happenedAt: '2025-12-25', note: 'the cake' },
        ]) {
            await fetch(`${BASE}/api/chamber/story`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${peerToken}` },
                body: JSON.stringify(entry),
            });
        }

        await page.locator('nav button').filter({ hasText: 'story' }).first().click();
        await page.waitForSelector('text=The beginning', { timeout: 6000 });

        const body = await page.locator('#chamber-root').innerText();
        assert.ok(
            body.indexOf('The beginning') < body.indexOf('That day'),
            'oldest first, so it reads as a story rather than a feed'
        );
    });

    await t.test('leaving puts the game back and re-arms the corners', async () => {
        await page.locator('nav button').filter({ hasText: 'messages' }).first().click();
        await page.click('[aria-label="Leave"]');
        await page.waitForTimeout(400);

        assert.ok(
            await page.locator('#game-view.active').isVisible(),
            'the game should be showing again'
        );

        // And the ritual works a second time, from a clean state.
        await performRitual(page);
        await page.waitForSelector('#password-modal.show', { timeout: 4000 });
    });

    await t.test('nothing threw while she was in there', () => {
        assert.deepEqual(pageErrors, [], 'the page must not raise errors during normal use');
    });
});
