'use strict';

/**
 * The jar of reasons, reached from More.
 *
 * Real server, real database, the real built frontend, real Chrome — the same
 * shape as the rest of the browser suite. Port 5100: every port from 5080 to
 * 5099 is already claimed by another e2e or integration test file.
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
const MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27018/wg_reasons_e2e';

const session = createChamberSession({ port: 5100, mongoUri: MONGO_URI, jwtSecret: 'reasons-e2e-secret' });
const { BASE, HER, HER_PASSWORD, HIM, HIS_PASSWORD } = session;

const BAR = 'nav[aria-label="Chamber sections"]';
const REASON_TEXT_1 = 'You make terrible tea and I love it anyway.';
const REASON_TEXT_HER = 'You remember the little things.';

/** Just the token, for a plain fetch — no socket needed here. */
async function tokenFor(username, password) {
    const res = await fetch(`${BASE}/api/auth/verify-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
    });
    const { token } = await res.json();
    return token;
}

async function openReasons(page) {
    await page.locator(`${BAR} [aria-label="More"]`).click();
    await page.locator('[role="dialog"] [aria-label="Reasons"]').click();
    await page.waitForSelector('text=Reasons', { timeout: 6000 });
}

test('the jar of reasons', async (t) => {
    if (!(await isReachable(MONGO_URI))) return t.skip(SKIP_MESSAGE);
    if (!fs.existsSync(DIST)) return t.skip('needs a built frontend: cd frontend && npm run build');

    await session.resetDatabase();
    await session.startServer();

    const browser = await chromium.launch({ executablePath: CHROME });
    t.after(async () => {
        await browser.close();
        await session.stopServer();
    });

    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await session.enterChamber(page, HIM, HIS_PASSWORD);
    await page.waitForSelector("text=Today's question", { timeout: 8000 });

    await t.test('More → Reasons opens the screen, on an empty jar', async () => {
        await openReasons(page);

        assert.equal(
            await page.locator(`${BAR} [aria-current="page"]`).getAttribute('aria-label'),
            'More',
            'the bar should show she is somewhere under More'
        );
        await page.waitForSelector('text=The jar is empty', { timeout: 4000 });
    });

    await t.test('the counter refuses more than 200 characters', async () => {
        const field = page.locator('textarea[aria-label="A reason"]');
        const addButton = page.locator('button').filter({ hasText: 'Drop it in' });

        await field.fill('x'.repeat(210));
        await page.waitForSelector('text=210 / 200', { timeout: 4000 });
        assert.equal(await addButton.isDisabled(), true, 'over 200 characters should refuse the add');

        await field.fill('');
        assert.equal(await addButton.isDisabled(), true, 'an empty field should refuse the add too');
    });

    await t.test('adding a reason shows it in the list, and it survives a reload', async () => {
        const field = page.locator('textarea[aria-label="A reason"]');
        const addButton = page.locator('button').filter({ hasText: 'Drop it in' });

        await field.fill(REASON_TEXT_1);
        assert.equal(await addButton.isDisabled(), false, 'a reason within the limit should be addable');
        await addButton.click();

        await page.waitForSelector(`text=${REASON_TEXT_1}`, { timeout: 6000 });
        // Clearing happens in the add mutation's own success callback, a tick
        // after the list itself has already refetched — give it a moment
        // rather than asserting the instant the list updates.
        await page.waitForFunction(
            () => document.querySelector('textarea[aria-label="A reason"]')?.value === '',
            null,
            { timeout: 4000 }
        );

        await page.reload();
        await session.enterChamber(page, HIM, HIS_PASSWORD);
        await page.waitForSelector("text=Today's question", { timeout: 8000 });

        await openReasons(page);
        await page.waitForSelector(`text=${REASON_TEXT_1}`, { timeout: 6000 });
    });

    await t.test('the reason just added becomes the reason of the day, the jar having been empty', async () => {
        await page.locator(`${BAR} [aria-label="Today"]`).click();
        await page.waitForSelector('text=Reason of the day', { timeout: 6000 });

        const body = await page.locator('#chamber-root').innerText();
        assert.ok(body.includes(REASON_TEXT_1), 'the one reason in the jar should be the one Today shows');
        assert.ok(body.includes(`— ${HIM}`), 'and it should be credited to whoever wrote it');
    });

    await t.test('you can delete your own; the other person has no delete control on theirs', async () => {
        const herToken = await tokenFor(HER, HER_PASSWORD);
        const res = await fetch(`${BASE}/api/chamber/reasons`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${herToken}` },
            body: JSON.stringify({ text: REASON_TEXT_HER }),
        });
        assert.equal(res.status, 201, 'seeding her reason over the API should succeed');

        // Away and back, so the screen remounts and refetches — the same way
        // any other screen in the chamber picks up a change made elsewhere.
        await page.locator(`${BAR} [aria-label="More"]`).click();
        await page.locator('[role="dialog"] [aria-label="List"]').click();
        await page.waitForTimeout(450); // longer than the slide and the sheet closing
        await openReasons(page);
        await page.waitForSelector(`text=${REASON_TEXT_HER}`, { timeout: 6000 });

        const mine = page.locator('li').filter({ hasText: REASON_TEXT_1 });
        const hers = page.locator('li').filter({ hasText: REASON_TEXT_HER });

        assert.equal(
            await hers.locator('[aria-label="Delete this reason"]').count(),
            0,
            'her reason should have no delete control on his screen'
        );
        assert.equal(
            await mine.locator('[aria-label="Delete this reason"]').count(),
            1,
            'his own reason should have exactly one delete control'
        );

        await mine.locator('[aria-label="Delete this reason"]').click();
        await page.waitForTimeout(500);

        assert.equal(await page.locator('li').filter({ hasText: REASON_TEXT_1 }).count(), 0, 'his reason should be gone');
        assert.equal(await page.locator('li').filter({ hasText: REASON_TEXT_HER }).count(), 1, 'hers should remain');
    });

    await t.test('nothing threw', () => {
        assert.deepEqual(pageErrors, []);
    });
});
