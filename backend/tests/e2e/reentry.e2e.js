'use strict';

/**
 * Leaving the chamber and coming back, in the same page.
 *
 * On a phone this is the ordinary way in: chamber.js closes the chamber the
 * moment the page is hidden, and nothing reloads — the stores and the query
 * cache carry straight into the next visit. Whatever the last visit, or the
 * last connection, heard about who is here and who is typing must not outlive
 * it.
 *
 * The browser is govind; radhe comes and goes over real sockets. Every toast
 * is recorded the instant it appears, as in presence.e2e.js. Real server, real
 * database, the real built frontend, real Chrome.
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
const MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27018/wg_reentry_e2e';

// Browser test files run concurrently, each on its own port; 5093 is unused elsewhere.
const session = createChamberSession({ port: 5093, mongoUri: MONGO_URI, jwtSecret: 'reentry-e2e-secret' });
const { HER, HER_PASSWORD, HIM, HIS_PASSWORD } = session;

const ARRIVED = `${HER} is here`;
const LEFT = `${HER} left`;
const CHAT_TAB = 'nav[aria-label="Chamber sections"] [aria-label="Chat"]';

/** Records the title of every toast as it appears, from the first paint. */
async function openRecordingPage(browser) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();

    await page.addInitScript(() => {
        window.__toasts = [];
        const seen = new WeakSet();
        new MutationObserver(() => {
            document.querySelectorAll('[data-sonner-toast]').forEach((toast) => {
                const title = toast.querySelector('[data-title]');
                if (!title || seen.has(toast)) return;
                seen.add(toast);
                window.__toasts.push(title.textContent.trim());
            });
        }).observe(document, { childList: true, subtree: true, characterData: true });
    });

    return { context, page };
}

const toastsSeen = (page) => page.evaluate(() => window.__toasts.slice());
const countOf = (list, text) => list.filter((t) => t === text).length;

async function waitForToastCount(page, text, count, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (countOf(await toastsSeen(page), text) >= count) return;
        await page.waitForTimeout(100);
    }
    throw new Error(`expected ${count} "${text}" toast(s) within ${timeoutMs}ms; saw ${JSON.stringify(await toastsSeen(page))}`);
}

/** Rejects with `message` if `promise` has not settled within `ms`. */
function withTimeout(promise, ms, message) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message || `timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
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

const onlineDots = (page) => page.locator('[aria-label="Online"]');
const statusLine = (page) => page.locator('h2', { hasText: HER }).locator('xpath=following-sibling::p').first();

/** Chat, with her conversation open. Both survive leaving, so it may already be open. */
async function openHerConversation(page) {
    await page.locator(CHAT_TAB).click();
    const log = page.locator('[role="log"][aria-label="Messages"]');
    if ((await log.count()) === 0) {
        await page.locator('li button').filter({ hasText: HER }).first().click();
    }
    await log.waitFor({ timeout: 8000 });
}

async function leaveWithTheButton(page) {
    await page.locator('[aria-label="Leave"]').click();
    await page.waitForSelector('#game-view.active', { timeout: 4000 });
}

/** She switches apps: the page is hidden and the frozen auto-exit in chamber.js closes the chamber. */
async function leaveByHidingThePage(page) {
    await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
        delete document.hidden;
    });
    await page.waitForSelector('#game-view.active', { timeout: 4000 });
}

test('presence and typing after leaving and coming back', { timeout: 240_000 }, async (t) => {
    if (!(await isReachable(MONGO_URI))) return t.skip(SKIP_MESSAGE);
    if (!fs.existsSync(DIST)) return t.skip('needs a built frontend: cd frontend && npm run build');

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

    const { page } = await openRecordingPage(browser);
    page.on('pageerror', (error) => pageErrors.push(error.message));

    async function connectHer() {
        const socket = await withTimeout(session.connectPerson(HER, HER_PASSWORD), 10_000, 'her socket did not connect');
        sockets.push(socket);
        return socket;
    }

    await t.test('(i) after coming back, her second tab is not an arrival, and her leaving still is', { timeout: 45_000 }, async () => {
        const firstTab = await connectHer();

        await session.enterChamber(page, HIM, HIS_PASSWORD);
        await page.waitForTimeout(1500); // the conversation list has said who is here

        await leaveWithTheButton(page);
        await session.reenterChamber(page, HIM, HIS_PASSWORD);
        await page.waitForTimeout(1500);

        const secondTab = await connectHer();
        await page.waitForTimeout(2000);
        const seenAfterSecondTab = await toastsSeen(page);

        // Closed before anything is asserted, so the next check starts with her gone.
        firstTab.close();
        secondTab.close();
        await waitForToastCount(page, LEFT, 1, 9000);

        assert.equal(
            countOf(seenAfterSecondTab, ARRIVED),
            0,
            `she never left, so nothing should say she arrived; saw ${JSON.stringify(seenAfterSecondTab)}`
        );
    });

    await t.test('(ii) someone who left while you were away is not shown online when you come back', { timeout: 45_000 }, async () => {
        // A live arrival, so this page holds a live "online" for her.
        const before = countOf(await toastsSeen(page), ARRIVED);
        const tab = await connectHer();
        await waitForToastCount(page, ARRIVED, before + 1, 5000);

        await openHerConversation(page);
        await waitForCondition(
            async () => (await statusLine(page).textContent()) === 'Online',
            5000,
            'the header should read "Online" while she is here'
        );
        assert.equal(await onlineDots(page).count(), 1, 'her row should show the online dot while she is here');

        await leaveWithTheButton(page);
        tab.close();
        await page.waitForTimeout(6500); // stored offline, and the grace period long gone

        await session.reenterChamber(page, HIM, HIS_PASSWORD);
        await openHerConversation(page);

        for (const moment of ['on coming back', 'a second later']) {
            if (moment === 'a second later') await page.waitForTimeout(1000);
            assert.equal(await onlineDots(page).count(), 0, `her row should have no online dot ${moment}`);
            const status = await statusLine(page).textContent();
            assert.notEqual(status, 'Online', `the header should not read "Online" ${moment}`);
        }
    });

    let herTab;

    await t.test('(iii) typing never outlives the visit', { timeout: 45_000 }, async () => {
        herTab = await connectHer();
        await openHerConversation(page);

        // Kept alive the way keystrokes would, so the server's own expiry
        // cannot send the stop before he has gone.
        herTab.emit('typing:start', { receiver: HIM });
        const keepTyping = setInterval(() => herTab.emit('typing:start', { receiver: HIM }), 1000);
        try {
            await page.locator('[data-typing-indicator]').waitFor({ timeout: 5000 });
            await leaveByHidingThePage(page);
        } finally {
            clearInterval(keepTyping);
        }

        // She stops while he is away, so he never hears it.
        herTab.emit('typing:stop', { receiver: HIM });
        await page.waitForTimeout(500);

        await session.reenterChamber(page, HIM, HIS_PASSWORD);
        await openHerConversation(page);

        for (const moment of ['on coming back', 'a second later']) {
            if (moment === 'a second later') await page.waitForTimeout(1000);
            assert.equal(await page.locator('[data-typing-indicator]').count(), 0, `no typing bubble ${moment}`);
            assert.notEqual(await statusLine(page).textContent(), 'typing…', `the header should not say typing ${moment}`);
            assert.equal(await page.getByText('typing…').count(), 0, `nothing should say typing ${moment}`);
        }
    });

    await t.test('(iv) a page left open across a server restart forgets who was here', { timeout: 60_000 }, async () => {
        // She is still connected from (iii), and this page heard her arrive live.
        // A stop while he is here clears any typing (iii) left behind, so the
        // header can only be about whether she is online.
        await openHerConversation(page);
        herTab.emit('typing:stop', { receiver: HIM });
        await waitForCondition(
            async () => (await statusLine(page).textContent()) === 'Online',
            5000,
            'the header should read "Online" before the restart'
        );

        await session.stopServer();
        herTab.close(); // she does not come back with it
        await session.startServer(); // boot clears her stored flag; nothing is broadcast

        await waitForCondition(
            async () => (await statusLine(page).textContent()) !== 'Online' && (await onlineDots(page).count()) === 0,
            20_000,
            `after reconnecting she should not show as online; header ${JSON.stringify(await statusLine(page).textContent())}`
        );

        // And the next time she really arrives, it is announced.
        await page.waitForTimeout(1500);
        const before = countOf(await toastsSeen(page), ARRIVED);
        await connectHer();
        await waitForToastCount(page, ARRIVED, before + 1, 5000);
    });

    await t.test('nothing threw', () => {
        assert.deepEqual(pageErrors, []);
    });
});
