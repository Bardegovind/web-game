'use strict';

/**
 * The Chat badge clears when you read, and the header agrees about who is
 * online.
 *
 * Two defects seen in the final screenshots:
 *  - the bottom bar's Chat badge stayed at 4 while that conversation was
 *    open and being read
 *  - the desktop list showed radhe online while the header next to it said
 *    "Last seen just now"
 *
 * Real server, real database, the real built frontend, real Chrome.
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
const MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27018/wg_read_presence_e2e';

const session = createChamberSession({ port: 5092, mongoUri: MONGO_URI, jwtSecret: 'read-presence-e2e-secret' });
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

/** The digits inside the Chat nav button, or null when no badge is shown. */
async function chatBadge(page) {
    const button = page.locator('nav[aria-label="Chamber sections"] [aria-label="Chat"]');
    const text = (await button.textContent()) || '';
    const match = text.match(/\d+/);
    return match ? Number(match[0]) : null;
}

/**
 * Watches the Chat badge from inside the page: sampled every 100 ms, and on
 * every change to the bar in between, so a count that is on screen for only a
 * moment is still caught. Returns a function that stops watching and gives
 * back every number seen.
 */
async function watchChatBadge(page) {
    await page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label="Chamber sections"]');
        window.__badgeNumbers = [];
        const look = () => {
            const button = nav.querySelector('[aria-label="Chat"]');
            const match = ((button && button.textContent) || '').match(/\d+/);
            if (match) window.__badgeNumbers.push(Number(match[0]));
        };
        window.__badgeObserver = new MutationObserver(look);
        window.__badgeObserver.observe(nav, { childList: true, subtree: true, characterData: true });
        window.__badgeSampler = setInterval(look, 100);
    });

    return () =>
        page.evaluate(() => {
            window.__badgeObserver.disconnect();
            clearInterval(window.__badgeSampler);
            return window.__badgeNumbers.slice();
        });
}

test('the Chat badge clears when you read, and the header agrees about who is online', { timeout: 120_000 }, async (t) => {
    if (!(await isReachable(MONGO_URI))) return t.skip(SKIP_MESSAGE);
    if (!fs.existsSync(DIST)) return t.skip('needs a built frontend: cd frontend && npm run build');

    await session.resetDatabase();
    await session.startServer();

    const browser = await chromium.launch({ executablePath: CHROME });
    const pageErrors = [];

    t.after(async () => {
        await browser.close();
        await session.stopServer();
    });

    // radhe's socket connects before govind ever enters, and stays open
    // across the phone and (first) desktop checks — root cause 3 only shows
    // up when no live presence:update arrives after entry because she was
    // already online.
    const herSocket = await withTimeout(
        session.connectPerson(HER, HER_PASSWORD), 10_000, 'her socket did not connect'
    );
    t.after(() => herSocket.close());

    await withTimeout(
        (async () => {
            for (let i = 1; i <= 3; i++) {
                await sendAndWait(herSocket, { receiver: HIM, text: `unread ${i}`, type: 'text', clientId: `seed-${i}` });
            }
        })(),
        20_000,
        'seeding the first 3 messages timed out'
    );

    const phoneContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
    });
    const phonePage = await phoneContext.newPage();
    phonePage.on('pageerror', (error) => pageErrors.push(`[phone] ${error.message}`));
    t.after(() => phoneContext.close());

    // Every socket frame passes straight through, except that read receipts
    // can be held back on demand, as a slow phone network would.
    let socketReadDelayMs = 0;
    await phonePage.routeWebSocket(/\/socket\.io\//, (ws) => {
        const server = ws.connectToServer();
        ws.onMessage((message) => {
            if (socketReadDelayMs && typeof message === 'string' && message.includes('"message:read"')) {
                setTimeout(() => server.send(message), socketReadDelayMs);
            } else {
                server.send(message);
            }
        });
        server.onMessage((message) => ws.send(message));
    });

    await t.test('opening the conversation clears the Chat badge', { timeout: 30_000 }, async () => {
        await session.enterChamber(phonePage, HIM, HIS_PASSWORD);

        // Today's content, freshly loaded, is what the badge count comes from.
        await phonePage.locator('text=3 new messages').first().waitFor({ timeout: 8000 });

        assert.equal(await chatBadge(phonePage), 3, 'the Chat badge should show the 3 unread messages');

        await phonePage.locator('nav[aria-label="Chamber sections"] [aria-label="Chat"]').click();
        await phonePage.locator('li button').filter({ hasText: HER }).first().click();

        const log = phonePage.locator('[role="log"][aria-label="Messages"]');
        await log.waitFor({ timeout: 8000 });
        await log.getByText('unread 3').first().waitFor({ timeout: 8000 });

        await waitForCondition(
            async () => (await chatBadge(phonePage)) === null,
            4000,
            `the Chat badge should have cleared within 4s but still showed ${await chatBadge(phonePage)}`
        );
    });

    await t.test("messages arriving while you read never raise the badge, even for a moment", { timeout: 30_000 }, async () => {
        const log = phonePage.locator('[role="log"][aria-label="Messages"]');

        // The read lands slowly, as it can on a phone network. Until it does,
        // nothing else may refresh the badge from a count that still includes
        // the message on screen.
        const READ = '**/chat/read/**';
        await phonePage.route(READ, async (route) => {
            await new Promise((r) => setTimeout(r, 400));
            await route.continue();
        });
        socketReadDelayMs = 400;

        try {
            for (const [i, text] of ['while you read 1', 'while you read 2'].entries()) {
                const stopWatching = await watchChatBadge(phonePage);

                await withTimeout(
                    sendAndWait(herSocket, { receiver: HIM, text, type: 'text', clientId: `live-${i + 1}` }),
                    8000,
                    `sending "${text}" timed out`
                );
                await log.getByText(text).first().waitFor({ timeout: 8000 });
                await phonePage.waitForTimeout(1500);

                const numbers = await stopWatching();
                assert.deepEqual(numbers, [], `the Chat badge showed a number in the 1.5s after "${text}" arrived`);
            }
        } finally {
            await phonePage.unroute(READ);
        }

        assert.equal(
            await chatBadge(phonePage),
            null,
            'the Chat badge should not show a number while the conversation is open and visible'
        );
    });

    const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const desktopPage = await desktopContext.newPage();
    desktopPage.on('pageerror', (error) => pageErrors.push(`[desktop] ${error.message}`));
    t.after(() => desktopContext.close());

    let statusLine;

    await t.test('the header agrees with the list when she was already online', { timeout: 20_000 }, async () => {
        await session.enterChamber(desktopPage, HIM, HIS_PASSWORD);

        await desktopPage.locator('nav[aria-label="Chamber sections"] [aria-label="Chat"]').click();
        const listRow = desktopPage.locator('li button').filter({ hasText: HER }).first();
        await listRow.waitFor({ timeout: 8000 });
        await listRow.click();

        const log = desktopPage.locator('[role="log"][aria-label="Messages"]');
        await log.waitFor({ timeout: 8000 });

        // Reused from presence.e2e.js: how the online dot is selected.
        const dot = desktopPage.locator('[aria-label="Online"]').first();
        await dot.waitFor({ timeout: 5000 });
        assert.match(await dot.getAttribute('class'), /bg-emerald-400/);

        statusLine = desktopPage.locator('h2', { hasText: HER }).locator('xpath=following-sibling::p').first();
        await waitForCondition(
            async () => (await statusLine.textContent()) === 'Online',
            5000,
            `the header should read "Online" but showed ${JSON.stringify(await statusLine.textContent())}`
        );
    });

    await t.test('when she leaves, both agree', { timeout: 15_000 }, async () => {
        herSocket.close();

        await waitForCondition(
            async () => (await statusLine.textContent()) !== 'Online',
            9000,
            'the header should have stopped reading "Online" within 9s'
        );
        const finalStatus = await statusLine.textContent();
        assert.ok(
            /Last seen|Offline/.test(finalStatus || ''),
            `expected "Last seen …" or "Offline", got ${JSON.stringify(finalStatus)}`
        );

        await waitForCondition(
            async () => (await desktopPage.locator('[aria-label="Online"]').count()) === 0,
            9000,
            'the list row should have lost its online dot'
        );
    });

    await t.test('nothing threw', () => {
        assert.deepEqual(pageErrors, []);
    });
});

test('her very first message is read when the conversation is already open', { timeout: 60_000 }, async (t) => {
    if (!(await isReachable(MONGO_URI))) return t.skip(SKIP_MESSAGE);
    if (!fs.existsSync(DIST)) return t.skip('needs a built frontend: cd frontend && npm run build');

    // A fresh database: he has written to her, and she has never written to him.
    await session.resetDatabase();
    await session.startServer();

    const browser = await chromium.launch({ executablePath: CHROME });
    const sockets = [];
    const pageErrors = [];

    t.after(async () => {
        sockets.forEach((s) => s.close());
        await browser.close();
        await session.stopServer();
    });

    const hisSocket = await withTimeout(session.connectPerson(HIM, HIS_PASSWORD), 10_000, 'his socket did not connect');
    sockets.push(hisSocket);
    await withTimeout(
        sendAndWait(hisSocket, { receiver: HER, text: 'are you there?', type: 'text', clientId: 'his-first' }),
        8000,
        'his first message was not confirmed'
    );

    const herSocket = await withTimeout(session.connectPerson(HER, HER_PASSWORD), 10_000, 'her socket did not connect');
    sockets.push(herSocket);

    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await session.enterChamber(page, HIM, HIS_PASSWORD);
    await page.locator('nav[aria-label="Chamber sections"] [aria-label="Chat"]').click();
    await page.locator('li button').filter({ hasText: HER }).first().click();

    const log = page.locator('[role="log"][aria-label="Messages"]');
    await log.getByText('are you there?').first().waitFor({ timeout: 8000 });
    await page.waitForTimeout(500);

    await t.test('the badge shows no number after she writes for the first time', { timeout: 20_000 }, async () => {
        const stopWatching = await watchChatBadge(page);

        await withTimeout(
            sendAndWait(herSocket, { receiver: HIM, text: 'here, always', type: 'text', clientId: 'her-first' }),
            8000,
            'her first message was not confirmed'
        );
        await log.getByText('here, always').first().waitFor({ timeout: 8000 });
        await page.waitForTimeout(1500);

        const numbers = await stopWatching();
        assert.equal(await chatBadge(page), null, 'her first message was on screen as it arrived, so it is read');
        assert.deepEqual(numbers, [], 'and the badge never showed a number meanwhile');
    });

    await t.test('nothing threw', () => {
        assert.deepEqual(pageErrors, []);
    });

    await context.close();
});
