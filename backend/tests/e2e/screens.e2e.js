'use strict';

/**
 * Moving between screens without anything flashing.
 *
 * Every screen shows a skeleton while its data loads. Each skeleton that
 * appears is counted the instant it is added, because against a local server
 * one lasts only a few milliseconds — far too briefly to catch by looking
 * afterwards.
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
const MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27018/wg_screens_e2e';
const BAR = 'nav[aria-label="Chamber sections"]';

const session = createChamberSession({ port: 5084, mongoUri: MONGO_URI, jwtSecret: 'screens-e2e-secret' });

test('switching screens', async (t) => {
    if (!(await isReachable(MONGO_URI))) return t.skip(SKIP_MESSAGE);
    if (!fs.existsSync(DIST)) return t.skip('needs a built frontend: cd frontend && npm run build');

    await session.resetDatabase();
    await session.startServer();

    const browser = await chromium.launch({ executablePath: CHROME });
    t.after(async () => {
        await browser.close();
        session.stopServer();
    });

    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.addInitScript(() => {
        window.__recording = false;
        window.__skeletons = 0;
        new MutationObserver((mutations) => {
            if (!window.__recording) return;
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    if (node.matches('[data-skeleton]')) window.__skeletons += 1;
                    window.__skeletons += node.querySelectorAll('[data-skeleton]').length;
                }
            }
        }).observe(document, { childList: true, subtree: true });
    });

    await session.enterChamber(page, session.HIM, session.HIS_PASSWORD);
    // Today has loaded; the rest of the entry prefetch lands alongside it.
    await page.waitForSelector("text=Today's question", { timeout: 8000 });
    await page.waitForTimeout(1500);

    await t.test('the recorder counts a skeleton when one appears', async () => {
        const counted = await page.evaluate(() => {
            window.__recording = true;
            const probe = document.createElement('div');
            probe.setAttribute('data-skeleton', '');
            document.body.appendChild(probe);
            return new Promise((resolve) => {
                setTimeout(() => {
                    probe.remove();
                    const seen = window.__skeletons;
                    window.__skeletons = 0;
                    resolve(seen);
                }, 50);
            });
        });
        assert.equal(counted, 1, 'without this, the next test could pass by seeing nothing at all');
    });

    await t.test('opening every screen for the first time shows no loading placeholder', async () => {
        const steps = [['Chat'], ['Moments'], ['Letters'], ['More', 'Story'], ['More', 'List'], ['Today']];

        for (const [section, insideMore] of steps) {
            await page.locator(`${BAR} [aria-label="${section}"]`).click();
            if (insideMore) await page.locator(`[role="dialog"] [aria-label="${insideMore}"]`).click();
            await page.waitForTimeout(450); // longer than the slide and the sheet closing
        }

        assert.equal(
            await page.evaluate(() => window.__skeletons),
            0,
            'every screen\'s data should already be there when it opens'
        );
    });

    await t.test('the bar highlights where you are, including inside More', async () => {
        await page.locator(`${BAR} [aria-label="More"]`).click();
        await page.locator('[role="dialog"] [aria-label="Story"]').click();
        await page.waitForTimeout(300);

        assert.equal(await page.locator(`${BAR} [aria-current="page"]`).getAttribute('aria-label'), 'More');
    });

    await t.test('nothing threw', () => {
        assert.deepEqual(pageErrors, []);
    });
});
