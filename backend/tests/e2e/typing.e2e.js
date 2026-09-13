'use strict';

/**
 * A typing indicator you can actually see.
 *
 * radhe types over a real socket; govind's browser should show a bouncing
 * bubble, an accent-coloured "typing…" in the header, and the same word in
 * the conversation list — then all three should revert the moment she
 * stops. Real server, real database, the real built frontend, real Chrome.
 *
 * govind's browser opens (and its socket connects) before radhe's socket
 * does, the same order presence.e2e.js uses — his client only learns she is
 * online from a live `presence:update`, not from anything seeded ahead of
 * time.
 *
 * The server also auto-expires a typing state after 3s of silence
 * (backend/services/typing.service.js's DEFAULT_TTL_MS), so this test keeps
 * radhe's typing alive with a repeating emit while it checks the bubble, the
 * header, and the list — the same way a real client's keystrokes would.
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
const MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27018/wg_typing_e2e';

// The brief suggested port 5089, but pwa.e2e.js already hard-codes that port
// and `node --test` runs e2e files concurrently — both servers would race
// for the same socket. 5090 is free (see the ports used across tests/e2e).
const session = createChamberSession({ port: 5090, mongoUri: MONGO_URI, jwtSecret: 'typing-e2e-secret' });
const { HER, HER_PASSWORD, HIM, HIS_PASSWORD } = session;

/** Rejects with `message` if `promise` has not settled within `ms`. */
function withTimeout(promise, ms, message) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message || `timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Same pattern as chatLayout.e2e.js: a bare emit, confirmed by the server's own broadcast back. */
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

function sendAndWait(socket, payload) {
    const confirmed = nextEvent(socket, 'message:sent', 8000, (m) => m.clientId === payload.clientId);
    socket.emit('message:send', payload);
    return confirmed;
}

/** Polls `check()` until it returns a truthy value, or throws after `timeoutMs`. */
async function waitForCondition(check, timeoutMs, message) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const value = await check();
        if (value) return value;
        if (Date.now() >= deadline) throw new Error(message || `condition not met within ${timeoutMs}ms`);
        await new Promise((r) => setTimeout(r, 100));
    }
}

test('a typing indicator you can actually see', { timeout: 90_000 }, async (t) => {
    if (!(await isReachable(MONGO_URI))) return t.skip(SKIP_MESSAGE);
    if (!fs.existsSync(DIST)) return t.skip('needs a built frontend: cd frontend && npm run build');

    await session.resetDatabase();
    await session.startServer();

    const browser = await chromium.launch({ executablePath: CHROME });
    const pageErrors = [];

    t.after(async () => {
        await browser.close();
        session.stopServer();
    });

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push(error.message));
    t.after(() => context.close());

    // govind is in the chamber, socket connected, before radhe connects —
    // so his client learns she is online from a live presence update.
    await session.enterChamber(page, HIM, HIS_PASSWORD);

    const herSocket = await withTimeout(
        session.connectPerson(HER, HER_PASSWORD), 10_000, 'her socket did not connect'
    );
    t.after(() => herSocket.close());

    // Seed one message from radhe to govind so the conversation exists in
    // the list; his browser is already listening, so it arrives live.
    await withTimeout(
        sendAndWait(herSocket, { receiver: HIM, text: 'hi from radhe', type: 'text', clientId: 'seed-1' }),
        10_000,
        'seeding the message timed out'
    );

    await page.locator('nav[aria-label="Chamber sections"] [aria-label="Chat"]').click();
    const listRow = page.locator('li button').filter({ hasText: HER }).first();
    await listRow.waitFor({ timeout: 8000 });
    await listRow.click();

    const log = page.locator('[role="log"][aria-label="Messages"]');
    await log.waitFor({ timeout: 8000 });
    await log.getByText('hi from radhe').first().waitFor({ timeout: 8000 });

    const statusLine = page.locator('h2', { hasText: HER }).locator('xpath=following-sibling::p').first();
    await waitForCondition(
        async () => (await statusLine.textContent()) === 'Online',
        8000,
        'radhe never showed as Online before typing started'
    );
    const onlineColor = await statusLine.evaluate((el) => getComputedStyle(el).color);

    const listPreview = listRow.locator('span.truncate.text-sm');

    // Keep her "typing" alive across subtests 1-3: the server auto-expires
    // after 3s of silence, so a single emit would not survive all three
    // checks. A real client re-sends on every keystroke; this stands in for
    // that.
    herSocket.emit('typing:start', { receiver: HIM });
    const keepTyping = setInterval(() => herSocket.emit('typing:start', { receiver: HIM }), 1000);
    t.after(() => clearInterval(keepTyping));

    await t.test('the bubble appears', async () => {
        const bubble = page.locator('[data-typing-indicator]');
        await bubble.waitFor({ state: 'visible', timeout: 3000 });

        assert.equal(await bubble.getAttribute('role'), 'status');
        const text = (await bubble.textContent()) || '';
        assert.match(text, new RegExp(`${HER} is typing`));

        const dots = bubble.locator('[aria-hidden="true"]');
        assert.equal(await dots.count(), 3, 'exactly three dots');
        for (let i = 0; i < 3; i++) {
            const box = await dots.nth(i).boundingBox();
            assert.ok(box, `dot ${i} should be laid out`);
            assert.ok(box.width >= 8, `dot ${i} width ${box.width} should be >= 8px`);
        }

        const inner = bubble.locator(':scope > div').first();
        const innerBox = await inner.boundingBox();
        assert.ok(innerBox, 'the bubble should be laid out');
        assert.ok(innerBox.height >= 36, `bubble height ${innerBox.height} should be >= 36px`);
    });

    await t.test('the header says typing…', async () => {
        await waitForCondition(
            async () => (await statusLine.textContent())?.includes('typing…'),
            3000,
            'header never said "typing…"'
        );
        const typingColor = await statusLine.evaluate((el) => getComputedStyle(el).color);
        assert.notEqual(typingColor, onlineColor, 'typing colour should differ from the Online colour');
    });

    await t.test('the list says typing…', async () => {
        await waitForCondition(
            async () => (await listPreview.textContent())?.includes('typing…'),
            3000,
            'list row never said "typing…"'
        );
    });

    await t.test('it goes away when she stops', async () => {
        clearInterval(keepTyping);
        herSocket.emit('typing:stop', { receiver: HIM });

        await page.locator('[data-typing-indicator]').waitFor({ state: 'detached', timeout: 2000 });
        await waitForCondition(
            async () => (await statusLine.textContent()) === 'Online',
            2000,
            'header never returned to "Online"'
        );
        await waitForCondition(
            async () => (await listPreview.textContent())?.includes('hi from radhe'),
            2000,
            'list row never returned to the normal preview'
        );
    });

    await t.test('nothing threw', () => {
        assert.deepEqual(pageErrors, []);
    });
});
