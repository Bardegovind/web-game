'use strict';

/**
 * Being told, live, when the other person comes into the chamber.
 *
 * The browser is govind; radhe arrives and leaves over real sockets. Every
 * toast is recorded the instant it appears, because a toast lives only four
 * seconds and a later look would miss one.
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
const MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27018/wg_presence_e2e';

const session = createChamberSession({ port: 5085, mongoUri: MONGO_URI, jwtSecret: 'presence-e2e-secret' });
const { HER, HER_PASSWORD, HIM, HIS_PASSWORD } = session;

const ARRIVED = `${HER} is here`;
const LEFT = `${HER} left`;

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

async function waitForToast(page, text, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if ((await toastsSeen(page)).includes(text)) return;
        await page.waitForTimeout(100);
    }
    throw new Error(`no "${text}" toast within ${timeoutMs}ms; saw ${JSON.stringify(await toastsSeen(page))}`);
}

test('live presence toasts', async (t) => {
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
        session.stopServer();
    });

    const { context, page } = await openRecordingPage(browser);
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await session.enterChamber(page, HIM, HIS_PASSWORD);

    await t.test('your own arrival is never announced', async () => {
        await page.waitForTimeout(1500);
        const seen = await toastsSeen(page);
        assert.ok(!seen.some((text) => text.endsWith('is here')), `saw ${JSON.stringify(seen)}`);
    });

    let firstTab;

    await t.test('someone arriving is announced', async () => {
        firstTab = await session.connectPerson(HER, HER_PASSWORD);
        sockets.push(firstTab);
        await waitForToast(page, ARRIVED, 5000);
        assert.equal(countOf(await toastsSeen(page), ARRIVED), 1);
    });

    await t.test('the header says she is here, from any screen', async () => {
        // The dot in Chat is only visible once you are in Chat. Whether she is
        // here is the first thing you want to know on walking in, so the header
        // carries it on every screen — Today included.
        const header = page.locator('header [aria-label="radhe is here"]');
        await header.waitFor({ timeout: 5000 });

        assert.match(
            await header.locator('span').first().getAttribute('class'),
            /bg-emerald-400/,
            'and it is the same green as the dot in Chat'
        );
    });

    await t.test('their online dot turns green', async () => {
        await page.locator('nav[aria-label="Chamber sections"] [aria-label="Chat"]').click();
        const dot = page.locator('[aria-label="Online"]').first();
        await dot.waitFor({ timeout: 5000 });
        assert.match(await dot.getAttribute('class'), /bg-emerald-400/);
    });

    let secondTab;

    await t.test('their second tab does not announce them again', async () => {
        secondTab = await session.connectPerson(HER, HER_PASSWORD);
        sockets.push(secondTab);
        await page.waitForTimeout(1500);
        assert.equal(countOf(await toastsSeen(page), ARRIVED), 1, 'the server says "online" once per tab');
    });

    await t.test('closing one of their tabs is not a departure', async () => {
        secondTab.close();
        await page.waitForTimeout(6500);
        assert.equal(countOf(await toastsSeen(page), LEFT), 0);
    });

    await t.test('a quick disconnect and reconnect announces nothing', async () => {
        firstTab.close();
        await page.waitForTimeout(2000);
        firstTab = await session.connectPerson(HER, HER_PASSWORD);
        sockets.push(firstTab);
        await page.waitForTimeout(6500);

        const seen = await toastsSeen(page);
        assert.equal(countOf(seen, LEFT), 0, 'back inside the grace period is not a departure');
        assert.equal(countOf(seen, ARRIVED), 1, 'and not a second arrival either');
    });

    await t.test('leaving is announced, but only after the grace period', async () => {
        firstTab.close();
        await page.waitForTimeout(4000);
        assert.equal(countOf(await toastsSeen(page), LEFT), 0, 'not before five seconds');

        await waitForToast(page, LEFT, 5000);
    });

    await t.test('and stops saying it once she has gone', async () => {
        await page.locator('header [aria-label="radhe is not here"]').waitFor({ timeout: 5000 });
        assert.equal(
            await page.locator('header [aria-label="radhe is here"]').count(),
            0,
            'a stale green dot would be worse than none'
        );
    });

    await t.test('nothing threw', () => {
        assert.deepEqual(pageErrors, []);
    });

    await context.close();

    await t.test('someone already here when you enter is not announced on their next tab', async () => {
        const alreadyHere = await session.connectPerson(HER, HER_PASSWORD);
        sockets.push(alreadyHere);

        const fresh = await openRecordingPage(browser);
        await session.enterChamber(fresh.page, HIM, HIS_PASSWORD);
        await fresh.page.waitForTimeout(1500); // the conversation list has seeded who is here

        const anotherTab = await session.connectPerson(HER, HER_PASSWORD);
        sockets.push(anotherTab);
        await fresh.page.waitForTimeout(1500);

        assert.equal(countOf(await toastsSeen(fresh.page), ARRIVED), 0);
        await fresh.context.close();
    });
});
