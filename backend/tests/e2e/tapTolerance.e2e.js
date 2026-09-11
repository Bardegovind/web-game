'use strict';

/**
 * How forgiving the corners are to a real thumb.
 *
 * Every other test taps the exact centre of a corner. A thumb does not, and
 * that gap was the actual bug: at the original 100x100 a tap aimed at the
 * corner with ordinary drift landed outside roughly a third of the time. A miss
 * is silent — it does not reset her progress, but it does not count either —
 * so sixteen taps registered as thirteen and she had to keep going with no idea
 * why.
 *
 * These numbers are the guarantee. If a layout change ever shrinks a corner
 * again, this fails rather than quietly making her struggle.
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

/** Where a thumb actually aims: at the corner, a little way in from both edges. */
const AIM_INSET = 45;

/** The drift a hurried tap can have and still be counted. */
const TOLERATED_DRIFT = 80;

const DEVICES = [
    { name: 'small phone', width: 360, height: 640 },
    { name: 'phone', width: 390, height: 844 },
    { name: 'large phone', width: 430, height: 932 },
];

const RITUAL = [
    { zone: 1, taps: 16 },
    { zone: 2, taps: 3 },
    { zone: 3, taps: 7 },
];

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

const aimPointFor = (zone, vp) => ({
    1: { x: AIM_INSET, y: AIM_INSET },
    2: { x: vp.width - AIM_INSET, y: AIM_INSET },
    3: { x: vp.width - AIM_INSET, y: vp.height - AIM_INSET },
}[zone]);

for (const device of DEVICES) {
    test(`the corners forgive a real thumb on a ${device.name}`, async (t) => {
        if (!fs.existsSync(path.join(FRONTEND, 'index.html'))) {
            return t.skip('needs a built frontend: cd frontend && npm run build');
        }

        const { server, port } = await startStaticServer();
        const browser = await chromium.launch({ executablePath: CHROME });
        const context = await browser.newContext({
            viewport: { width: device.width, height: device.height },
            hasTouch: true,
            isMobile: true,
        });
        const page = await context.newPage();

        t.after(async () => {
            await browser.close();
            server.close();
        });

        await page.goto(`http://127.0.0.1:${port}/`);
        await page.waitForSelector('#board .cell');
        await page.waitForTimeout(800);

        await t.test('the game fits without scrolling', async () => {
            const scrolls = await page.evaluate(
                () => document.documentElement.scrollHeight > window.innerHeight + 1
            );
            assert.equal(scrolls, false, 'a phone should not have to scroll to see the board');
        });

        await t.test('every game control is still reachable', async () => {
            const blocked = await page.evaluate(() => {
                const out = [];
                for (const el of document.querySelectorAll('#board .cell, .game-actions button')) {
                    const r = el.getBoundingClientRect();
                    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                    if (top !== el && !el.contains(top)) out.push(el.className || el.id);
                }
                return out;
            });
            assert.deepEqual(blocked, [], 'a hidden corner must never sit on top of a button or a cell');
        });

        await t.test('the two top corners never meet', async () => {
            const left = await page.locator('[data-tap="1"]').boundingBox();
            const right = await page.locator('[data-tap="2"]').boundingBox();

            assert.ok(
                left.x + left.width < right.x,
                'overlapping corners would credit a tap to the wrong one and reset her'
            );
        });

        for (const { zone, taps } of RITUAL) {
            await t.test(`corner ${zone}: all ${taps} taps count despite drift`, async () => {
                const aim = aimPointFor(zone, device);

                await page.evaluate((z) => {
                    window.__counted = 0;
                    document.querySelector(`[data-tap="${z}"]`)
                        .addEventListener('pointerdown', () => { window.__counted += 1; }, true);
                }, zone);

                // A deterministic spread rather than random, so a failure is
                // reproducible rather than something that shows up once a week.
                for (let i = 0; i < taps; i++) {
                    const angle = (i / taps) * Math.PI * 2;
                    const x = aim.x + Math.cos(angle) * TOLERATED_DRIFT;
                    const y = aim.y + Math.sin(angle) * TOLERATED_DRIFT;

                    await page.touchscreen.tap(
                        Math.min(device.width - 2, Math.max(2, x)),
                        Math.min(device.height - 2, Math.max(2, y))
                    );
                }

                const counted = await page.evaluate(() => window.__counted);
                assert.equal(
                    counted,
                    taps,
                    `${taps} taps must count as ${taps} — losing one is how she ends up tapping seventeen times`
                );
            });
        }
    });
}
