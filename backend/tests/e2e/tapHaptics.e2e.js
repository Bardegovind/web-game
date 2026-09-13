'use strict';

/**
 * What her hand feels during the ritual.
 *
 * Reported twice from a real phone: the top-left corner buzzed, the top-right
 * and bottom-right did not, so there was no way to tell whether a tap on those
 * corners had landed at all.
 *
 * The first cause was counting. Sixteen identical buzzes cannot be counted by
 * feel, and landing on fifteen or seventeen sends the machine back to the
 * start. So the end of each corner feels different now.
 *
 * The second cause was silence. A tap on top-right before top-left was
 * finished gave nothing back, so a miscount looked exactly like a dead corner.
 * Every tap on a corner is now felt, and what it feels like says what happened:
 *
 *   tick         counted
 *   two pulses   this corner is done, move on
 *   long buzz    that did not count, start again from top-left
 *   unlock       the door is opening
 *
 * Taps on the game itself are never felt.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');

const { HAPTICS } = require('../../../frontend/public/js/tapZones.js');

const FRONTEND = path.join(__dirname, '..', '..', '..', 'frontend', 'dist');
const CHROME = '/usr/bin/google-chrome';
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.png': 'image/png',
    '.webmanifest': 'application/json',
};

const TICK = JSON.stringify(HAPTICS.TICK);
const STEP_DONE = JSON.stringify(HAPTICS.STEP_DONE);
const UNLOCKED = JSON.stringify(HAPTICS.UNLOCKED);
const START_OVER = JSON.stringify(HAPTICS.START_OVER);

function startStaticServer() {
    const server = http.createServer((req, res) => {
        const rel = decodeURIComponent(req.url.split('?')[0]);
        const file = path.join(FRONTEND, rel === '/' ? 'index.html' : rel);

        if (!file.startsWith(FRONTEND) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            res.writeHead(200, { 'Content-Type': MIME['.js'] });
            return res.end('window.io = function () { return { on(){}, emit(){}, disconnect(){}, io:{on(){}} }; };');
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(fs.readFileSync(file));
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

/** Opens the game on a phone with every vibration recorded, in order. */
async function openRecordingPhone(t) {
    const { server, port } = await startStaticServer();
    const browser = await chromium.launch({ executablePath: CHROME });
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
    });
    const page = await context.newPage();

    t.after(async () => {
        await browser.close();
        server.close();
    });

    await page.addInitScript(() => {
        window.__felt = [];
        Object.defineProperty(navigator, 'vibrate', {
            configurable: true,
            value: (pattern) => {
                window.__felt.push(JSON.stringify(pattern));
                return true;
            },
        });
    });

    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForSelector('#board .cell');
    await page.waitForTimeout(800);

    return page;
}

async function tapCorner(page, zone, times) {
    const box = await page.locator(`[data-tap="${zone}"]`).boundingBox();
    for (let i = 0; i < times; i++) {
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(40);
    }
}

const felt = (page) => page.evaluate(() => window.__felt.slice());

if (!fs.existsSync(path.join(FRONTEND, 'index.html'))) {
    test('haptics', (t) => t.skip('needs a built frontend: cd frontend && npm run build'));
} else {
    test('the four feelings are all different from each other', () => {
        // Checked explicitly: an undefined pattern would otherwise compare equal
        // to another undefined one and let a missing feeling pass unnoticed.
        for (const [name, pattern] of Object.entries({ TICK, STEP_DONE, UNLOCKED, START_OVER })) {
            assert.ok(pattern !== undefined, `${name} must be defined`);
        }

        const all = [TICK, STEP_DONE, UNLOCKED, START_OVER];
        assert.equal(new Set(all).size, 4, 'each moment must be distinguishable by feel alone');
    });

    test('every counted tap on every corner is felt', async (t) => {
        const page = await openRecordingPhone(t);

        await tapCorner(page, 1, 16);
        await tapCorner(page, 2, 3);
        await tapCorner(page, 3, 7);

        const pulses = await felt(page);
        assert.equal(pulses.length, 26, 'sixteen, three and seven: twenty-six taps, twenty-six things felt');
    });

    test('the sixteenth tap feels different, so she knows to move on', async (t) => {
        const page = await openRecordingPhone(t);

        await tapCorner(page, 1, 16);
        const pulses = await felt(page);

        assert.ok(pulses.slice(0, 15).every((p) => p === TICK), 'the first fifteen are ordinary ticks');
        assert.equal(pulses[15], STEP_DONE, 'the sixteenth says "move on"');
    });

    test('the third tap on top-right says "move on" too', async (t) => {
        const page = await openRecordingPhone(t);

        await tapCorner(page, 1, 16);
        await tapCorner(page, 2, 3);
        const pulses = await felt(page);

        assert.equal(pulses[16], TICK);
        assert.equal(pulses[17], TICK);
        assert.equal(pulses[18], STEP_DONE);
    });

    test('opening the door feels like opening the door', async (t) => {
        const page = await openRecordingPhone(t);

        await tapCorner(page, 1, 16);
        await tapCorner(page, 2, 3);
        await tapCorner(page, 3, 7);
        const pulses = await felt(page);

        assert.ok(pulses.slice(19, 25).every((p) => p === TICK), 'the first six on bottom-right are ordinary ticks');
        assert.equal(pulses[25], UNLOCKED);
        assert.ok(await page.locator('#password-modal.show').isVisible());
    });

    /**
     * The reported problem, exactly. One short on top-left used to make every
     * tap on top-right completely silent, which looked like a dead corner.
     */
    test('top-right is felt even when top-left was not finished', async (t) => {
        const page = await openRecordingPhone(t);

        await tapCorner(page, 1, 15);
        await tapCorner(page, 2, 3);
        const pulses = await felt(page);

        assert.equal(pulses.length, 18, 'fifteen on top-left and three on top-right: all eighteen felt');
        assert.deepEqual(
            pulses.slice(15),
            [START_OVER, START_OVER, START_OVER],
            'each tap on top-right says "that did not count, start again"'
        );
    });

    test('bottom-right is felt even when the corners before it were not finished', async (t) => {
        const page = await openRecordingPhone(t);

        await tapCorner(page, 1, 16);
        await tapCorner(page, 2, 2);
        await tapCorner(page, 3, 2);
        const pulses = await felt(page);

        assert.equal(pulses.length, 20, 'every tap on every corner is felt');
        assert.deepEqual(pulses.slice(18), [START_OVER, START_OVER]);
    });

    test('one tap too many on top-left is felt as start again', async (t) => {
        const page = await openRecordingPhone(t);

        await tapCorner(page, 1, 17);
        const pulses = await felt(page);

        assert.equal(pulses.length, 17, 'all seventeen taps are felt, including the one too many');
        assert.equal(pulses[15], STEP_DONE);
        assert.equal(pulses[16], START_OVER, 'the seventeenth tells her she went one too far');
    });

    test('after a start-again buzz, the ritual works from the beginning', async (t) => {
        const page = await openRecordingPhone(t);

        await tapCorner(page, 2, 1);
        await tapCorner(page, 1, 16);
        await tapCorner(page, 2, 3);
        await tapCorner(page, 3, 7);

        const pulses = await felt(page);
        assert.equal(pulses[0], START_OVER);
        assert.equal(pulses[pulses.length - 1], UNLOCKED);
        assert.ok(await page.locator('#password-modal.show').isVisible());
    });

    test('playing the game itself never vibrates', async (t) => {
        const page = await openRecordingPhone(t);

        for (const cell of [4, 0, 8, 2]) {
            await page.locator(`[data-cell="${cell}"]`).tap();
            await page.waitForTimeout(60);
        }
        await page.locator('#btn-restart').tap();

        assert.deepEqual(await felt(page), [], 'only the hidden corners are ever felt');
    });
}
