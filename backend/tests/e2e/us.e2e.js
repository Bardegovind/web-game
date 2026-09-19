'use strict';

/**
 * "Us" — the day they met, and the time of day it happened.
 *
 * A couple knows the minute, not just the date: "17 April 2024, 1:46 pm". A
 * date-only field throws that away and there is nowhere to put it back, so
 * the sheet takes a moment and the card says it back to them.
 *
 * Port 5102: 5100 is the reasons suite, 5101 the screenshot rig.
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
const MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27018/wg_us_e2e';

const session = createChamberSession({ port: 5102, mongoUri: MONGO_URI, jwtSecret: 'us-e2e-secret' });
const { HIM, HIS_PASSWORD } = session;

const MET = '2024-04-17T13:46';

test('the moment they met', async (t) => {
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
    await page.waitForSelector('text=Us', { timeout: 8000 });

    await t.test('the sheet asks for a time, not only a day', async () => {
        await page.locator('[aria-label="Edit when we started"]').click();

        const field = page.locator('[aria-label="When we met"]');
        await field.waitFor({ timeout: 4000 });
        assert.equal(
            await field.getAttribute('type'),
            'datetime-local',
            'a date-only field cannot hold 1:46 pm'
        );
    });

    await t.test('the minute they met is saved, and said back to them', async () => {
        await page.locator('[aria-label="When we met"]').fill(MET);
        await page.locator('button').filter({ hasText: /^Save$/ }).click();

        await page.waitForSelector('text=/17 April 2024/', { timeout: 6000 });
        const card = await page.locator('text=/17 April 2024/').first().innerText();
        assert.match(card, /1:46/, 'the time of day is part of the moment');
        assert.match(card, /pm/i, 'and it is an afternoon, not 1:46 in the morning');
    });

    await t.test('the moment survives a reload, and is still counted in whole days', async () => {
        await session.enterChamber(page, HIM, HIS_PASSWORD);
        await page.waitForSelector('text=/17 April 2024/', { timeout: 8000 });

        // Whole years, months and days — a time of day does not turn the
        // count into hours, or into nothing at all.
        const duration = page.locator('p').filter({ hasText: /^\d+ (year|month|day)/ }).first();
        await duration.waitFor({ timeout: 4000 });
        assert.match(await duration.innerText(), /^\d+ (year|month|day)/);

        const countdown = page.locator('p').filter({ hasText: /to the next anniversary|anniversary is today/ });
        assert.equal(await countdown.count(), 1, 'and the countdown still knows when April comes round');
    });

    await t.test('nothing threw', () => {
        assert.deepEqual(pageErrors, []);
    });
});
