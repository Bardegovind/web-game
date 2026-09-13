'use strict';

/**
 * What her hand feels during the ritual.
 *
 * Reported from a real phone: the top-left corner buzzed on every tap, the
 * other two never did. Instrumenting it showed the haptics were fine — the
 * problem was counting. Sixteen identical buzzes cannot be counted reliably by
 * feel, and landing on fifteen or seventeen sends the machine back to the start,
 * after which the other two corners do nothing and say nothing.
 *
 * So the end of each step has to feel different from an ordinary tap. She taps
 * until she feels it, then moves on, and never has to count.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');

const FRONTEND = path.join(__dirname, '..', '..', '..', 'frontend', 'dist');
const CHROME = '/usr/bin/google-chrome';
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.png': 'image/png',
    '.webmanifest': 'application/json',
};

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

        const tick = pulses[0];
        assert.ok(
            pulses.slice(0, 15).every((p) => p === tick),
            'the first fifteen should all feel the same'
        );
        assert.notEqual(pulses[15], tick, 'the sixteenth must not feel like the fifteen before it');
    });

    test('the third tap on the second corner feels the same as the sixteenth did', async (t) => {
        const page = await openRecordingPhone(t);

        await tapCorner(page, 1, 16);
        await tapCorner(page, 2, 3);
        const pulses = await felt(page);

        const tick = pulses[0];
        const stepDone = pulses[15];

        assert.equal(pulses[16], tick, 'the first tap on the second corner is an ordinary tap');
        assert.equal(pulses[17], tick);
        assert.equal(pulses[18], stepDone, 'one signal means "move on", wherever she is');
    });

    test('opening the door feels different again', async (t) => {
        const page = await openRecordingPhone(t);

        await tapCorner(page, 1, 16);
        await tapCorner(page, 2, 3);
        await tapCorner(page, 3, 7);
        const pulses = await felt(page);

        const tick = pulses[0];
        const stepDone = pulses[15];
        const opened = pulses[25];

        assert.ok(pulses.slice(19, 25).every((p) => p === tick), 'the first six on the last corner are ordinary');
        assert.notEqual(opened, tick, 'the seventh is not an ordinary tap');
        assert.notEqual(opened, stepDone, 'and it is not a step either — the door has opened');
        assert.ok(await page.locator('#password-modal.show').isVisible());
    });

    /**
     * Nothing a stranger does by accident should feel like anything. A single
     * tap on the top-right corner of a fresh game is not part of the ritual.
     */
    test('a stray tap on another corner at the start is not felt', async (t) => {
        const page = await openRecordingPhone(t);

        await tapCorner(page, 2, 1);
        await tapCorner(page, 3, 1);

        assert.deepEqual(await felt(page), [], 'a corner tapped out of order gives nothing away');
    });
}
