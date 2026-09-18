'use strict';

/**
 * The chamber still scrolls with a finger.
 *
 * The game screen is locked still: the page cannot scroll and the game refuses
 * touch gestures. The chamber is a fixed overlay on the same page and scrolls
 * inside itself, so that lock must never reach it. Forty messages, a phone,
 * and a real finger drag on the message list. Real server, real database, the
 * real built frontend, real Chrome.
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
const MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27018/wg_chamber_scroll_e2e';

// 5095 belongs to tests/integration/messageClientId.int.js; 5080 is unused elsewhere.
const session = createChamberSession({ port: 5080, mongoUri: MONGO_URI, jwtSecret: 'chamber-scroll-e2e-secret' });
const { HER, HER_PASSWORD, HIM, HIS_PASSWORD } = session;

const MESSAGES = 40;

function withTimeout(promise, ms, message) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message || `timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Sends over a real socket and resolves once the server's own broadcast confirms it was stored. */
function sendAndWait(socket, payload) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.off('message:sent', listener);
            reject(new Error(`timed out storing ${payload.clientId}`));
        }, 8000);
        function listener(message) {
            if (message.clientId !== payload.clientId) return;
            clearTimeout(timer);
            socket.off('message:sent', listener);
            resolve(message);
        }
        socket.on('message:sent', listener);
        socket.emit('message:send', payload);
    });
}

async function swipe(cdp, x, y, dx, dy) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 10; i++) {
        await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: x + (dx * i) / 10, y: y + (dy * i) / 10 }],
        });
        await new Promise((r) => setTimeout(r, 16));
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('the chamber message list scrolls under a finger', { timeout: 120_000 }, async (t) => {
    if (!(await isReachable(MONGO_URI))) return t.skip(SKIP_MESSAGE);
    if (!fs.existsSync(DIST)) return t.skip('needs a built frontend: cd frontend && npm run build');

    await session.resetDatabase();
    await session.startServer();

    const browser = await chromium.launch({ executablePath: CHROME });
    t.after(async () => {
        await browser.close();
        await session.stopServer();
    });

    const her = await withTimeout(session.connectPerson(HER, HER_PASSWORD), 10_000, 'her socket did not connect');
    const him = await withTimeout(session.connectPerson(HIM, HIS_PASSWORD), 10_000, 'his socket did not connect');
    await withTimeout((async () => {
        for (let i = 1; i <= MESSAGES; i++) {
            const fromHer = i % 2 === 1;
            await sendAndWait(fromHer ? her : him, {
                receiver: fromHer ? HIM : HER,
                text: `message number ${i}, long enough to take a line or two on a phone`,
                type: 'text',
                clientId: `scroll-${i}`,
            });
        }
    })(), 60_000, 'seeding messages timed out');
    her.close();
    him.close();

    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);

    await withTimeout(session.enterChamber(page, HIM, HIS_PASSWORD), 30_000, 'entering the chamber timed out');
    await page.locator('nav[aria-label="Chamber sections"] [aria-label="Chat"]').click();
    await page.locator('li button').filter({ hasText: HER }).first().click();

    const log = page.locator('[role="log"][aria-label="Messages"]');
    await log.waitFor({ timeout: 8000 });
    await log.getByText(`message number ${MESSAGES},`).first().waitFor({ timeout: 8000 });
    await page.waitForTimeout(800); // let the scroll-to-latest settle

    const metrics = await log.evaluate((el) => ({ scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
    assert.ok(metrics.scrollHeight > metrics.clientHeight + 200, `forty messages should overflow the log (${JSON.stringify(metrics)})`);

    const box = await log.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height * 0.3;

    // Finger moves down: the list scrolls back towards older messages.
    await swipe(cdp, x, y, 0, 260);
    await page.waitForTimeout(900);

    const after = await log.evaluate((el) => el.scrollTop);
    assert.notEqual(Math.round(after), Math.round(metrics.scrollTop),
        `a finger drag should scroll the message list (scrollTop stayed at ${metrics.scrollTop})`);
    assert.ok(after < metrics.scrollTop, `dragging down should reveal older messages (${metrics.scrollTop} -> ${after})`);

    await context.close();
});
