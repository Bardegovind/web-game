'use strict';

/**
 * The chat never scrolls sideways.
 *
 * A screenshot from the user showed a horizontal scrollbar on the message
 * list, with received bubbles cut off on their left edge — caused by the
 * Reply/React hover actions being positioned against the full-width row
 * instead of the bubble. Real server, real database, the real built
 * frontend, real Chrome.
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
const MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27018/wg_chat_layout_e2e';

const session = createChamberSession({ port: 5087, mongoUri: MONGO_URI, jwtSecret: 'chat-layout-e2e-secret' });
const { HER, HER_PASSWORD, HIM, HIS_PASSWORD } = session;

// A 120-character unbroken string — a URL with no spaces — the kind of
// content that could widen a badly laid-out bubble past its container.
const LONG_TEXT = 'https://example.com/' + 'a'.repeat(120 - 'https://example.com/'.length);

/** Rejects with `message` if `promise` has not settled within `ms`. */
function withTimeout(promise, ms, message) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message || `timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Resolves with the first payload for `event` that satisfies `match`, or
 * rejects on timeout. Same pattern as socket.int.js's `nextEvent` — a bare
 * `.emit()` with no ack, confirmed by the server's own broadcast back to the
 * sender, so a stalled or dropped ack callback can never hang the test.
 */
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

/** 3 short from her, 2 short from him, then her long unbroken message last. */
async function seedConversation(herSocket, himSocket) {
    for (let i = 1; i <= 3; i++) {
        await sendAndWait(herSocket, { receiver: HIM, text: `hi, message ${i}`, type: 'text', clientId: `her-${i}` });
    }
    for (let i = 1; i <= 2; i++) {
        await sendAndWait(himSocket, { receiver: HER, text: `hey, reply ${i}`, type: 'text', clientId: `him-${i}` });
    }
    await sendAndWait(herSocket, { receiver: HIM, text: LONG_TEXT, type: 'text', clientId: 'her-long' });
}

async function openConversation(page) {
    await session.enterChamber(page, HIM, HIS_PASSWORD);
    await page.locator('nav[aria-label="Chamber sections"] [aria-label="Chat"]').click();
    await page.locator('li button').filter({ hasText: HER }).first().click();

    const log = page.locator('[role="log"][aria-label="Messages"]');
    await log.waitFor({ timeout: 8000 });
    // Scoped to the log itself — the conversation-list preview elsewhere in
    // the DOM shows the same truncated text and would otherwise match too.
    await log.getByText(LONG_TEXT.slice(0, 40)).first().waitFor({ timeout: 8000 });
    await page.waitForTimeout(600); // let the scroll-to-latest settle
    return log;
}

test('the chat never scrolls sideways', { timeout: 120_000 }, async (t) => {
    if (!(await isReachable(MONGO_URI))) return t.skip(SKIP_MESSAGE);
    if (!fs.existsSync(DIST)) return t.skip('needs a built frontend: cd frontend && npm run build');

    await session.resetDatabase();
    await session.startServer();

    const herSocket = await withTimeout(
        session.connectPerson(HER, HER_PASSWORD), 10_000, 'her socket did not connect'
    );
    const himSocket = await withTimeout(
        session.connectPerson(HIM, HIS_PASSWORD), 10_000, 'his socket did not connect'
    );
    await withTimeout(seedConversation(herSocket, himSocket), 20_000, 'seeding messages timed out');
    herSocket.close();
    himSocket.close();

    const browser = await chromium.launch({ executablePath: CHROME });
    const pageErrors = [];

    t.after(async () => {
        await browser.close();
        session.stopServer();
    });

    // A single flat subtest per viewport — no further nested t.test() calls,
    // matching the one-level-deep pattern the other e2e files use. An extra
    // nesting level here previously left orphaned work running after a
    // parent timeout, well past teardown.
    async function checkViewport(name, contextOptions) {
        await t.test(name, { timeout: 40_000 }, async () => {
            const context = await browser.newContext(contextOptions);
            const page = await context.newPage();
            page.on('pageerror', (error) => pageErrors.push(`[${name}] ${error.message}`));

            try {
                const log = await withTimeout(
                    openConversation(page), 20_000, `${name}: opening the conversation timed out`
                );

                const metrics = await log.evaluate((el) => ({
                    scrollWidth: el.scrollWidth,
                    clientWidth: el.clientWidth,
                    scrollLeft: el.scrollLeft,
                }));
                assert.ok(
                    metrics.scrollWidth <= metrics.clientWidth + 1,
                    `${name}: scrollWidth ${metrics.scrollWidth} should not exceed clientWidth ${metrics.clientWidth}`
                );
                assert.equal(metrics.scrollLeft, 0, `${name}: the log should not be scrolled sideways`);

                const logBox = await log.boundingBox();
                assert.ok(logBox, `${name}: the log should be laid out`);

                const replies = page.locator('[aria-label="Reply"]');
                const count = await replies.count();
                assert.ok(count > 0, `${name}: there should be reply actions to check`);

                for (let i = 0; i < count; i++) {
                    const rect = await replies.nth(i).boundingBox();
                    assert.ok(rect, `${name}: reply action ${i} should be laid out`);
                    assert.ok(
                        rect.x >= logBox.x - 1,
                        `${name}: reply ${i} left edge ${rect.x} should be within the log's left edge ${logBox.x}`
                    );
                    assert.ok(
                        rect.x + rect.width <= logBox.x + logBox.width + 1,
                        `${name}: reply ${i} right edge ${rect.x + rect.width} should be within the log's right edge ${logBox.x + logBox.width}`
                    );
                }

                const bubble = page.locator('p', { hasText: LONG_TEXT.slice(0, 30) }).first();
                const bubbleBox = await bubble.boundingBox();
                assert.ok(bubbleBox, `${name}: the long message should be laid out`);
                assert.ok(
                    bubbleBox.x + bubbleBox.width <= logBox.x + logBox.width + 1,
                    `${name}: the long message's right edge ${bubbleBox.x + bubbleBox.width} should be within the log's right edge ${logBox.x + logBox.width}`
                );
            } finally {
                await context.close();
            }
        });
    }

    await checkViewport('desktop', { viewport: { width: 1280, height: 800 } });
    await checkViewport('phone', { viewport: { width: 390, height: 844, isMobile: true, hasTouch: true } });

    await t.test('nothing threw', () => {
        assert.deepEqual(pageErrors, []);
    });
});
