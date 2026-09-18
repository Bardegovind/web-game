'use strict';

/**
 * What she sees during the ritual.
 *
 * It used to buzz two ways: a tiny tick when a tap counted and a long 220 ms
 * buzz when it sent her back to the start. On a real phone she read the long
 * buzz as "the button did not click", so the long one is gone. What is left is
 * gentle and the same every time, felt and seen together:
 *
 *   one soft tick + one glint    a tap landed on a corner (counted or not)
 *   two soft ticks + two glints  this corner is done, move on (the 16th, then the 3rd)
 *
 * The unlocking tap opens the password prompt. Taps on the game itself never
 * glow and never buzz, and no buzz is ever long enough to read as a rejection.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');

const { LIGHT_CLASS } = require('../../../frontend/public/js/tapZones.js');

const FRONTEND = path.join(__dirname, '..', '..', '..', 'frontend', 'dist');
const CHROME = '/usr/bin/google-chrome';
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.png': 'image/png',
    '.webmanifest': 'application/json',
};

/** The class every glint carries. Literal here so a missing export fails its own test, not every test. */
const LIGHT = 'tap-light';

/**
 * Nothing she feels may be longer than this, or it reads as a rejection rather
 * than a tap. In a vibration pattern the even positions are the buzzes and the
 * odd ones are the silences between them, so only the even ones are checked.
 */
const GENTLE_MS = 15;

/** What a single counted tap feels like. */
const TICK = 10;

/** Long enough for the second glint of a completed corner (about 150 ms later) to have been added. */
const SETTLE_MS = 400;

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

/**
 * Opens the game on a phone. Every vibration is recorded, and so is every
 * glint the moment it is added to the page, with where it was drawn.
 */
async function openRecordingPhone(t, extraContextOptions) {
    const { server, port } = await startStaticServer();
    const browser = await chromium.launch({ executablePath: CHROME });
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        ...extraContextOptions,
    });
    const page = await context.newPage();

    t.after(async () => {
        await browser.close();
        server.close();
    });

    await page.addInitScript((lightClass) => {
        window.__felt = [];
        Object.defineProperty(navigator, 'vibrate', {
            configurable: true,
            value: (pattern) => {
                window.__felt.push(JSON.stringify(pattern));
                return true;
            },
        });

        window.__lights = [];
        new MutationObserver((records) => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (node.nodeType !== 1 || !node.classList.contains(lightClass)) continue;
                    const box = node.getBoundingClientRect();
                    const style = getComputedStyle(node);
                    window.__lights.push({
                        cx: box.left + box.width / 2,
                        cy: box.top + box.height / 2,
                        width: box.width,
                        position: style.position,
                        pointerEvents: style.pointerEvents,
                        ariaHidden: node.getAttribute('aria-hidden'),
                        animationName: style.animationName,
                    });
                }
            }
        }).observe(document, { childList: true, subtree: true });
    }, LIGHT);

    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForSelector('#board .cell');
    await page.waitForTimeout(800);

    return page;
}

async function tapCorner(page, zone, times) {
    const box = await page.locator(`[data-tap="${zone}"]`).boundingBox();
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    for (let i = 0; i < times; i++) {
        await page.touchscreen.tap(at.x, at.y);
        await page.waitForTimeout(40);
    }
    return at;
}

const felt = (page) => page.evaluate(() => window.__felt.slice());
const lights = (page) => page.evaluate(() => window.__lights.slice());
const lightsInDom = (page) => page.evaluate((c) => document.querySelectorAll(`.${c}`).length, LIGHT);

/** Taps the ritual corner by corner and returns the cumulative glint count after each corner. */
async function ritualCounts(page) {
    const after = [];
    for (const [zone, times] of [[1, 16], [2, 3], [3, 7]]) {
        await tapCorner(page, zone, times);
        await page.waitForTimeout(SETTLE_MS);
        after.push((await lights(page)).length);
    }
    return after;
}

if (!fs.existsSync(path.join(FRONTEND, 'index.html'))) {
    test('tap feedback', (t) => t.skip('needs a built frontend: cd frontend && npm run build'));
} else {
    test('the glint class is exported for tests', () => {
        assert.equal(LIGHT_CLASS, LIGHT);
    });

    test('(a) the full ritual opens the password prompt, and every buzz stays gentle', async (t) => {
        const page = await openRecordingPhone(t);

        await tapCorner(page, 1, 16);
        await tapCorner(page, 2, 3);
        await tapCorner(page, 3, 7);

        await page.waitForSelector('#password-modal.show', { timeout: 4000 });
        const buzzes = await felt(page);
        assert.equal(buzzes.length, 26, 'every one of the twenty-six taps is felt');
        for (const buzz of buzzes) {
            const pattern = [].concat(JSON.parse(buzz));
            for (let i = 0; i < pattern.length; i += 2) {
                assert.ok(pattern[i] <= GENTLE_MS,
                    `${buzz} is not gentle: a ${pattern[i]}ms buzz exceeds ${GENTLE_MS}ms, which reads as "that did not count"`);
            }
        }

        // The password prompt is not part of the still game screen: it must
        // stay tappable and typable with a finger.
        await page.locator('#input-username').tap();
        await page.keyboard.type('radhe');
        assert.equal(await page.inputValue('#input-username'), 'radhe');
        assert.notEqual(
            await page.evaluate(() => getComputedStyle(document.getElementById('password-modal')).touchAction),
            'none',
            'the password dialog must not block touch gestures'
        );
    });

    test('(b) one glint per corner tap, two when a corner is done: 17, then 4, then 7', async (t) => {
        const page = await openRecordingPhone(t);

        const after = await ritualCounts(page);
        assert.deepEqual(after, [17, 21, 28], 'sixteen plus the double, three plus the double, seven: 28 glints');

        const all = await lights(page);
        for (const light of all) {
            assert.equal(light.position, 'fixed');
            assert.equal(light.pointerEvents, 'none', 'a glint must never catch a tap');
            assert.equal(light.ariaHidden, 'true');
        }
    });

    test('glints are drawn where the finger touched', async (t) => {
        const page = await openRecordingPhone(t);

        const at = await tapCorner(page, 1, 1);
        await page.waitForTimeout(SETTLE_MS);

        const [light] = await lights(page);
        assert.ok(light, 'a glint should appear');
        assert.ok(Math.abs(light.cx - at.x) <= 2 && Math.abs(light.cy - at.y) <= 2,
            `glint centred at ${light.cx},${light.cy} should be at the touch ${at.x},${at.y}`);
    });

    test('(c) a tap on top-right before top-left is finished still shows exactly one glint', async (t) => {
        const page = await openRecordingPhone(t);

        await tapCorner(page, 2, 1);
        await page.waitForTimeout(SETTLE_MS);

        assert.equal((await lights(page)).length, 1);
        assert.deepEqual(await felt(page), [JSON.stringify(TICK)], 'a tap that starts the run over feels the same as any other');
    });

    test('(d) a second after the last tap, no glint is left in the page', async (t) => {
        const page = await openRecordingPhone(t);

        await tapCorner(page, 1, 16);
        await tapCorner(page, 2, 3);
        assert.ok((await lights(page)).length > 0, 'glints should have been shown');

        await page.waitForTimeout(1000);
        assert.equal(await lightsInDom(page), 0, 'every glint removes itself');
    });

    test('(e) playing the game shows no glint and never vibrates', async (t) => {
        const page = await openRecordingPhone(t);

        for (const cell of [4, 0, 8, 2]) {
            await page.locator(`[data-cell="${cell}"]`).tap();
            await page.waitForTimeout(60);
        }
        await page.locator('#btn-restart').tap();
        await page.waitForTimeout(60);
        await page.locator('#btn-reset-scores').tap();
        await page.waitForTimeout(SETTLE_MS);

        assert.equal((await lights(page)).length, 0, 'only the hidden corners ever glow');
        assert.deepEqual(await felt(page), [], 'nothing vibrates');
    });

    test('(f) with reduced motion the glints still show, with the same counts', async (t) => {
        const page = await openRecordingPhone(t, { reducedMotion: 'reduce' });

        const after = await ritualCounts(page);
        assert.deepEqual(after, [17, 21, 28]);

        await page.waitForTimeout(1000);
        assert.equal(await lightsInDom(page), 0, 'reduced-motion glints remove themselves too');
    });
}
