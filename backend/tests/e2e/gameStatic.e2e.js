'use strict';

/**
 * The game screen stays still under the finger.
 *
 * Reported from a real Android phone: touching the buttons or the board
 * scrolled or shifted the page, once with the whole layout pushed left and
 * its left edge cut off, and taps did not always land. The page was
 * `min-height: 100vh`, which on a phone is taller than the screen while the URL
 * bar shows, and nothing stopped a pan, a pinch or a double-tap zoom starting
 * on the game. A finished game also grew the page, pushing "Reset Scores"
 * underneath the bottom-right corner.
 *
 * Emulation has no URL bar and no double-tap zoom, so this cannot reproduce
 * the phone itself. It checks the mechanisms: nothing can scroll, the game
 * refuses touch gestures, and everything fits and is pressable at short
 * visible heights (a phone with its URL bar showing).
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

const DEVICES = [
    { width: 360, height: 800 },
    { width: 360, height: 640 },
    { width: 360, height: 560 },
    { width: 393, height: 750 },
    { width: 412, height: 915 },
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

/** Where the page is: scrolled, zoomed or panned. All zero and one when still. */
const position = (page) => page.evaluate(() => ({
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    scale: window.visualViewport.scale,
    offsetLeft: Math.round(window.visualViewport.offsetLeft),
    offsetTop: Math.round(window.visualViewport.offsetTop),
}));

const STILL = { scrollX: 0, scrollY: 0, scale: 1, offsetLeft: 0, offsetTop: 0 };

/** A real finger drag through the DevTools protocol, in eight moves. */
async function swipe(cdp, x, y, dx, dy) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 8; i++) {
        await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: x + (dx * i) / 8, y: y + (dy * i) / 8 }],
        });
        await new Promise((r) => setTimeout(r, 16));
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** Controls that are not fully on screen, or that something else covers at their centre. */
const unreachableControls = (page) => page.evaluate(() => {
    const out = [];
    const W = window.innerWidth;
    const H = window.innerHeight;
    for (const el of document.querySelectorAll('#board .cell, .game-actions button')) {
        const r = el.getBoundingClientRect();
        const name = el.id || `cell ${el.dataset.cell}`;
        if (r.left < -0.5 || r.top < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5) {
            out.push(`${name} is not fully on screen (${Math.round(r.top)}..${Math.round(r.bottom)} of ${H})`);
            continue;
        }
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (hit !== el && !el.contains(hit)) {
            out.push(`${name} is covered by ${hit ? hit.id || hit.className : 'nothing'}`);
        }
    }
    return out;
});

const centreOf = async (page, selector) => {
    const box = await page.locator(selector).first().boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

for (const device of DEVICES) {
    const name = `${device.width}x${device.height}`;

    test(`the game screen stays still on a ${name} phone`, async (t) => {
        if (!fs.existsSync(path.join(FRONTEND, 'index.html'))) {
            return t.skip('needs a built frontend: cd frontend && npm run build');
        }

        const { server, port } = await startStaticServer();
        const browser = await chromium.launch({ executablePath: CHROME });
        const context = await browser.newContext({
            viewport: { width: device.width, height: device.height },
            deviceScaleFactor: 2,
            hasTouch: true,
            isMobile: true,
        });
        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);

        t.after(async () => {
            await browser.close();
            server.close();
        });

        await page.goto(`http://127.0.0.1:${port}/`);
        await page.waitForSelector('#board .cell');
        await page.waitForTimeout(800);

        await t.test('(a) the page cannot scroll and the game refuses touch gestures', async () => {
            const styles = await page.evaluate(() => {
                const html = getComputedStyle(document.documentElement);
                const body = getComputedStyle(document.body);
                const game = getComputedStyle(document.getElementById('game-view'));
                return {
                    htmlOverflow: html.overflow,
                    bodyOverflow: body.overflow,
                    htmlOverscrollX: html.overscrollBehaviorX,
                    htmlOverscrollY: html.overscrollBehaviorY,
                    bodyOverscrollX: body.overscrollBehaviorX,
                    bodyOverscrollY: body.overscrollBehaviorY,
                    gameTouchAction: game.touchAction,
                    gameUserSelect: game.userSelect,
                };
            });
            assert.deepEqual(styles, {
                htmlOverflow: 'hidden',
                bodyOverflow: 'hidden',
                htmlOverscrollX: 'none',
                // A downward pull must still reach the browser: that is how the
                // page is refreshed on a phone.
                htmlOverscrollY: 'auto',
                bodyOverscrollX: 'none',
                bodyOverscrollY: 'auto',
                gameTouchAction: 'pan-y',
                gameUserSelect: 'none',
            });
        });

        await t.test('(b) nothing is taller or wider than the screen', async () => {
            const size = await page.evaluate(() => ({
                scrollHeight: document.documentElement.scrollHeight,
                scrollWidth: document.documentElement.scrollWidth,
                innerHeight: window.innerHeight,
                innerWidth: window.innerWidth,
            }));
            assert.ok(size.scrollHeight <= size.innerHeight + 1,
                `scrollHeight ${size.scrollHeight} should fit innerHeight ${size.innerHeight}`);
            assert.ok(size.scrollWidth <= size.innerWidth + 1,
                `scrollWidth ${size.scrollWidth} should fit innerWidth ${size.innerWidth}`);
        });

        await t.test('(c) every cell and both buttons are on screen and pressable', async () => {
            assert.deepEqual(await unreachableControls(page), []);
        });

        await t.test('(d) swipes on the board, the buttons and the scoreboard move nothing', async () => {
            const starts = {
                board: await centreOf(page, '#board .cell:nth-child(5)'),
                'New Game': await centreOf(page, '#btn-restart'),
                scoreboard: await centreOf(page, '.scoreboard .draw-score'),
            };

            for (const [where, at] of Object.entries(starts)) {
                for (const [dir, dx, dy] of [['up', 0, -160], ['down', 0, 160], ['left', -150, 0], ['right', 150, 0]]) {
                    await swipe(cdp, at.x, at.y, dx, dy);
                    await page.waitForTimeout(350);
                    assert.deepEqual(await position(page), STILL, `a swipe ${dir} starting on the ${where} moved the page`);
                }
            }
        });

        await t.test('(e) a tap still plays a cell, and New Game still clears the board', async () => {
            await page.locator('[data-cell="4"]').tap();
            await page.waitForTimeout(100);
            assert.equal(await page.locator('[data-cell="4"]').textContent(), 'X');

            await page.locator('#btn-restart').tap();
            await page.waitForTimeout(100);
            assert.equal(await page.locator('[data-cell="4"]').textContent(), '');
            assert.deepEqual(await position(page), STILL);
        });

        await t.test('(f) a finished game leaves everything where it was, and pressable', async () => {
            const before = await page.locator('.game-actions').boundingBox();

            for (const cell of [0, 3, 1, 4, 2]) {
                await page.locator(`[data-cell="${cell}"]`).tap();
                await page.waitForTimeout(80);
            }
            await page.waitForSelector('#result-banner.show');
            await page.waitForTimeout(700);

            const after = await page.locator('.game-actions').boundingBox();
            assert.ok(Math.abs(after.y - before.y) <= 1, `the buttons moved from y=${before.y} to y=${after.y} when the game ended`);

            const blocked = await page.evaluate(() => {
                const out = [];
                const H = window.innerHeight;
                for (const el of document.querySelectorAll('.game-actions button')) {
                    const r = el.getBoundingClientRect();
                    // Both ends of each button, not just the centre: the right end
                    // of Reset Scores is where the bottom-right corner used to sit.
                    for (const x of [r.left + 6, r.left + r.width / 2, r.right - 6]) {
                        const hit = document.elementFromPoint(x, r.top + r.height / 2);
                        if (r.bottom > H + 0.5 || (hit !== el && !el.contains(hit))) out.push(`${el.id} at x=${Math.round(x)}`);
                    }
                }
                return out;
            });
            assert.deepEqual(blocked, [], 'after a win both buttons must be fully pressable');

            const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
            assert.ok(scrollHeight <= device.height + 1, `after a win scrollHeight ${scrollHeight} should fit ${device.height}`);

            await page.locator('#btn-restart').tap();
            await page.waitForTimeout(100);
            assert.equal(await page.locator('#result-banner.show').count(), 0, 'New Game hides the result');
        });
    });
}
