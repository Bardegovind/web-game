'use strict';

/**
 * A message sent while the conversation's history is still loading stays on
 * screen.
 *
 * History used to replace the whole list when it landed. Its snapshot was
 * taken before the send, so the message disappeared from the sender's screen
 * — and when the send itself never reached the server it vanished with no
 * "Not sent". Here the history response is held so it always lands after the
 * send, the way a slow phone network delivers it. Real server, real database,
 * the real built frontend, real Chrome.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright-core');

const { isReachable, SKIP_MESSAGE } = require('../integration/requireMongo');
const { createChamberSession } = require('./support/chamberSession');

const CHROME = '/usr/bin/google-chrome';
const DIST = path.join(__dirname, '..', '..', '..', 'frontend', 'dist', 'index.html');
const MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27018/wg_chat_send_race_e2e';

const session = createChamberSession({ port: 5094, mongoUri: MONGO_URI, jwtSecret: 'chat-send-race-e2e-secret' });
const { HER, HER_PASSWORD, HIM, HIS_PASSWORD } = session;

const SEEDED = 6;
const LAST_SEED = `seed ${SEEDED}`;
/** How long the history answer is held after the server has produced it. */
const HOLD_MS = 800;
/** When the message is sent, after the conversation is opened. */
const SEND_AFTER_MS = 150;
const LOG = '[role="log"][aria-label="Messages"]';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

/** Rejects with `message` if `promise` has not settled within `ms`. */
function withTimeout(promise, ms, message) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message || `timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Resolves with the first payload for `event` that satisfies `match`. */
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

/** Sends over a real socket and resolves once the server confirms it stored it. */
function sendAndWait(socket, payload) {
    const confirmed = nextEvent(socket, 'message:sent', 8000, (m) => m.clientId === payload.clientId);
    socket.emit('message:send', payload);
    return confirmed;
}

async function seedConversation() {
    const her = await withTimeout(session.connectPerson(HER, HER_PASSWORD), 10_000, 'her socket did not connect');
    const him = await withTimeout(session.connectPerson(HIM, HIS_PASSWORD), 10_000, 'his socket did not connect');
    try {
        for (let i = 1; i <= SEEDED; i++) {
            const fromHer = i % 2 === 1;
            await sendAndWait(fromHer ? her : him, {
                receiver: fromHer ? HIM : HER, text: `seed ${i}`, type: 'text', clientId: `seed-${i}`,
            });
        }
    } finally {
        her.close();
        him.close();
    }
}

/** How many copies of `text` the server's history for his conversation with her holds. */
async function storedCopies(text) {
    const auth = await fetch(`${session.BASE}/api/auth/verify-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: HIM, password: HIS_PASSWORD }),
    });
    const { token } = await auth.json();
    const res = await fetch(`${session.BASE}/api/chat/messages/${HER}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200, 'the history API should answer');
    const { messages } = await res.json();
    return messages.filter((m) => m.text === text).length;
}

/**
 * Holds the next history response while `gate.armed`: the server runs its
 * query at once, so the snapshot predates the send, and the browser receives
 * it HOLD_MS later — and never sooner than 500 ms after the send, so the order
 * does not depend on how quickly this machine types.
 */
async function holdHistory(context, gate) {
    await context.route(/\/api\/chat\/messages\//, async (route) => {
        const response = await route.fetch();
        const body = await response.text();

        if (gate.armed) {
            gate.armed = false;
            const requestedAt = Date.now();
            await sleep(HOLD_MS);
            const deadline = Date.now() + 5000;
            while (!gate.sentAt && Date.now() < deadline) await sleep(20);
            if (gate.sentAt) await sleep(gate.sentAt + 500 - Date.now());
            gate.containedText = body.includes(gate.text);
            gate.heldMs = Date.now() - requestedAt;
            gate.releasedAt = Date.now();
        }

        await route.fulfill({ response, body });
    });
}

/** Watches the message log every 20 ms: copies of `text` now, the most ever shown, and "Not sent". */
function watchLog(page, text) {
    return page.evaluate(({ text, selector }) => {
        const state = { copies: 0, maxCopies: 0, notSent: false, notSentAt: null };
        window.__raceWatch = state;
        setInterval(() => {
            const log = document.querySelector(selector);
            const copies = log ? [...log.querySelectorAll('p')].filter((p) => p.textContent === text).length : 0;
            state.copies = copies;
            state.maxCopies = Math.max(state.maxCopies, copies);
            state.notSent = Boolean(log && log.textContent.includes('Not sent'));
            if (state.notSent && !state.notSentAt) state.notSentAt = Date.now();
        }, 20);
    }, { text, selector: LOG });
}

const readWatch = (page) => page.evaluate(() => ({ ...window.__raceWatch }));

/** Enters as him, opens her conversation with the history held, and sends `text` shortly after. */
async function sendWhileHistoryLoads(page, gate, text) {
    await session.enterChamber(page, HIM, HIS_PASSWORD);
    await page.locator('nav[aria-label="Chamber sections"] [aria-label="Chat"]').click();
    const herRow = page.locator('li button').filter({ hasText: HER }).first();
    await herRow.waitFor({ timeout: 8000 });
    await page.waitForTimeout(600); // the chat screen's slide-in settles, so the click lands at once

    await watchLog(page, text);
    gate.text = text;
    gate.armed = true;
    await herRow.click();
    const clickedAt = Date.now();

    const composer = page.locator('textarea[placeholder="Say something"]');
    await sleep(SEND_AFTER_MS - (Date.now() - clickedAt));
    await composer.fill(text);
    await composer.press('Enter');
    gate.sentAt = Date.now();

    // The history has rendered once her last seeded message is on screen.
    await page.locator(LOG).getByText(LAST_SEED, { exact: true }).first().waitFor({ timeout: 12_000 });
    assert.ok(gate.releasedAt >= gate.sentAt, 'the history should have landed after the send');
    assert.equal(gate.containedText, false, 'the held snapshot should predate the send');
}

test('a message sent while history loads stays on screen', { timeout: 180_000 }, async (t) => {
    if (!(await isReachable(MONGO_URI))) return t.skip(SKIP_MESSAGE);
    if (!fs.existsSync(DIST)) return t.skip('needs a built frontend: cd frontend && npm run build');

    let browser = null;
    // Registered before anything that can throw, so a failed seed never leaves the server running.
    t.after(async () => {
        if (browser) await browser.close();
        await session.stopServer();
    });

    await session.resetDatabase();
    await session.startServer();
    await withTimeout(seedConversation(), 30_000, 'seeding messages timed out');

    browser = await chromium.launch({ executablePath: CHROME });
    const pageErrors = [];
    const contexts = [];

    async function newPage(name) {
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
        contexts.push(context);
        const page = await context.newPage();
        page.on('pageerror', (error) => pageErrors.push(`[${name}] ${error.message}`));
        return { context, page };
    }

    const sentText = `sent while history loads ${Date.now()}`;
    let sentPage = null;

    await t.test('(a) sent during a slow history load, it is still visible, once, and stored', { timeout: 60_000 }, async () => {
        const { context, page } = await newPage('a');
        sentPage = page;
        const gate = {};
        await holdHistory(context, gate);

        await withTimeout(sendWhileHistoryLoads(page, gate, sentText), 40_000, '(a) sending timed out');
        await page.waitForTimeout(2000); // long enough for anything that would drop it to have run

        const seen = await readWatch(page);
        assert.equal(seen.copies, 1, 'the message should still be on screen after the history renders');
        assert.equal(seen.maxCopies, 1, 'the message should never be shown twice');
        assert.equal(seen.notSent, false, 'a delivered message should not say Not sent');
        assert.equal(await storedCopies(sentText), 1, 'the server should have stored it exactly once');
    });

    await t.test('(b) a send that never reaches the server stays on screen and says Not sent', { timeout: 60_000 }, async () => {
        const { context, page } = await newPage('b');
        const text = `never reaches the server ${Date.now()}`;
        const gate = {};
        const dropped = { frames: 0 };
        await holdHistory(context, gate);

        // The message:send carrying this text never leaves the browser, on either transport.
        await context.routeWebSocket(/\/socket\.io\//, (ws) => {
            const server = ws.connectToServer();
            ws.onMessage((message) => {
                if (typeof message === 'string' && message.includes('"message:send"') && message.includes(text)) {
                    dropped.frames++;
                    return;
                }
                server.send(message);
            });
            server.onMessage((message) => ws.send(message));
        });
        await context.route(/\/socket\.io\/.*transport=polling/, (route) => {
            const request = route.request();
            if (request.method() === 'POST' && (request.postData() || '').includes(text)) {
                dropped.frames++;
                return route.fulfill({ status: 200, contentType: 'text/html', body: 'ok' });
            }
            return route.continue();
        });

        await withTimeout(sendWhileHistoryLoads(page, gate, text), 40_000, '(b) sending timed out');
        assert.ok(dropped.frames > 0, 'the send should have been dropped before reaching the server');

        await page.waitForTimeout(1500);
        const afterHistory = await readWatch(page);
        assert.equal(afterHistory.copies, 1, 'the unsent message should still be on screen after the history renders');
        assert.equal(afterHistory.notSent, false, 'it is not marked failed before its 10 s are up');

        const deadline = gate.sentAt + 13_000;
        let seen = afterHistory;
        while (!seen.notSent && Date.now() < deadline) {
            await sleep(200);
            seen = await readWatch(page);
        }
        assert.equal(seen.notSent, true, 'it should say Not sent about 10 s after sending');
        assert.ok(seen.notSentAt - gate.sentAt >= 9_000, `Not sent should wait its 10 s (took ${seen.notSentAt - gate.sentAt} ms)`);
        assert.equal(seen.copies, 1, 'the failed message should be on screen exactly once');
        assert.equal(seen.maxCopies, 1, 'the failed message should never be shown twice');
        assert.equal(await storedCopies(text), 0, 'the server should not have it');
    });

    await t.test('(c) after a reload the message sent in (a) appears exactly once', { timeout: 40_000 }, async () => {
        assert.ok(sentPage, '(a) should have opened a page');
        const page = sentPage;
        await page.reload();
        await session.enterChamber(page, HIM, HIS_PASSWORD);
        await page.locator('nav[aria-label="Chamber sections"] [aria-label="Chat"]').click();
        await page.locator('li button').filter({ hasText: HER }).first().click();
        const log = page.locator(LOG);
        await log.getByText(LAST_SEED, { exact: true }).first().waitFor({ timeout: 10_000 });
        await page.waitForTimeout(1000);

        const copies = await log.locator('p').filter({ hasText: sentText }).count();
        assert.equal(copies, 1, 'the stored message should appear exactly once after a reload');
    });

    await t.test('(d) nothing threw', () => {
        assert.deepEqual(pageErrors, []);
    });
});
