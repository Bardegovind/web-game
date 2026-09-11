'use strict';

/**
 * End-to-end proof that the frozen ritual still opens the door in a real browser.
 *
 * Drives actual pointer input at the three hidden corners of the real page —
 * no mocks, no synthetic events dispatched from page script. If this passes,
 * the taps she makes on her phone work.
 *
 * Run: npm run test:e2e
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');

// The built artefact, so these exercise exactly what ships.
const FRONTEND = path.join(__dirname, '..', '..', '..', 'frontend', 'dist');
const CHROME = '/usr/bin/google-chrome';

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
};

/** Serves the built frontend. The chamber entrance needs no backend to open. */
function startStaticServer() {
    const server = http.createServer((req, res) => {
        const rel = decodeURIComponent(req.url.split('?')[0]);
        const file = path.join(FRONTEND, rel === '/' ? 'index.html' : rel);

        if (!file.startsWith(FRONTEND) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            // socket.io client is served by the real backend; stub it here.
            res.writeHead(200, { 'Content-Type': MIME['.js'] });
            res.end('window.io = function () { return { on(){}, emit(){}, disconnect(){} }; };');
            return;
        }

        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(fs.readFileSync(file));
    });

    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
    });
}

/** Taps a hidden corner by its data-tap id, using real pointer input at its centre. */
async function tapCorner(page, zoneId, times) {
    const box = await page.locator(`[data-tap="${zoneId}"]`).boundingBox();
    assert.ok(box, `corner ${zoneId} should exist and be laid out`);

    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    for (let i = 0; i < times; i++) {
        await page.mouse.click(x, y, { delay: 5 });
        await page.waitForTimeout(90); // above the 70ms debounce floor
    }
}

const modalIsOpen = (page) => page.locator('#password-modal.show').isVisible();

test('the 16 / 3 / 7 corner ritual opens the password prompt in a real browser', async (t) => {
    const { server, port } = await startStaticServer();
    const browser = await chromium.launch({ executablePath: CHROME });
    const page = await browser.newPage({ viewport: { width: 420, height: 850 } });

    t.after(async () => {
        await browser.close();
        server.close();
    });

    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForSelector('#board .cell');

    assert.equal(await modalIsOpen(page), false, 'the prompt must be hidden before the ritual');

    await tapCorner(page, 1, 16);
    assert.equal(await modalIsOpen(page), false, 'zone 1 alone must not open it');

    await tapCorner(page, 2, 3);
    assert.equal(await modalIsOpen(page), false, 'zones 1 and 2 alone must not open it');

    await tapCorner(page, 3, 7);
    await page.waitForSelector('#password-modal.show', { timeout: 2000 });

    assert.equal(await modalIsOpen(page), true, 'the full ritual should open the password prompt');
});

test('a wrong corner mid-run means the ritual does not open the prompt', async (t) => {
    const { server, port } = await startStaticServer();
    const browser = await chromium.launch({ executablePath: CHROME });
    const page = await browser.newPage({ viewport: { width: 420, height: 850 } });

    t.after(async () => {
        await browser.close();
        server.close();
    });

    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForSelector('#board .cell');

    await tapCorner(page, 1, 10);
    await tapCorner(page, 3, 1); // wrong corner — run is abandoned
    await tapCorner(page, 1, 6); // only 6 more, so this run is short
    await tapCorner(page, 2, 3);
    await tapCorner(page, 3, 7);

    assert.equal(await modalIsOpen(page), false, 'a broken run must not open the prompt');
});

test('playing the game does not disturb a run in progress', async (t) => {
    const { server, port } = await startStaticServer();
    const browser = await chromium.launch({ executablePath: CHROME });
    const page = await browser.newPage({ viewport: { width: 420, height: 850 } });

    t.after(async () => {
        await browser.close();
        server.close();
    });

    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForSelector('#board .cell');

    await tapCorner(page, 1, 16);
    await page.locator('[data-cell="4"]').click(); // she makes a move mid-ritual
    await tapCorner(page, 2, 3);
    await tapCorner(page, 3, 7);

    await page.waitForSelector('#password-modal.show', { timeout: 2000 });
    assert.equal(await modalIsOpen(page), true, 'a stray tap on the board must not cost her the run');
});

/**
 * The real-world case: a phone, and someone tapping fast because they know the
 * sequence by heart. This is where taps get lost to double-tap-zoom gesture
 * recognition and she ends up tapping 17, 18 times.
 */
test('sixteen fast taps on a touchscreen count as sixteen', async (t) => {
    const { server, port } = await startStaticServer();
    const browser = await chromium.launch({ executablePath: CHROME });
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 3,
    });
    const page = await context.newPage();

    t.after(async () => {
        await browser.close();
        server.close();
    });

    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForSelector('#board .cell');

    const tapFast = async (zoneId, times) => {
        const box = await page.locator(`[data-tap="${zoneId}"]`).boundingBox();
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        for (let i = 0; i < times; i++) {
            await page.touchscreen.tap(x, y); // no artificial delay — tapping at speed
        }
    };

    await tapFast(1, 16);
    await tapFast(2, 3);
    await tapFast(3, 7);

    assert.equal(
        await page.locator('#password-modal.show').isVisible(),
        true,
        'exactly 16/3/7 fast taps must open the prompt — no extra taps required'
    );
});

/**
 * Why the detector must listen on pointerdown rather than click.
 *
 * A press that never resolves into a click — the finger slides off the corner
 * before lifting, or the browser eats the click while deciding whether the
 * gesture was a double-tap-zoom — is still a deliberate tap. Binding to
 * pointerdown registers the intent the instant the finger lands.
 */
test('a press that never becomes a click still registers as a tap', async (t) => {
    const { server, port } = await startStaticServer();
    const browser = await chromium.launch({ executablePath: CHROME });
    const page = await browser.newPage({ viewport: { width: 420, height: 850 } });

    t.after(async () => {
        await browser.close();
        server.close();
    });

    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForSelector('#board .cell');

    const pressWithoutClick = async (zoneId, times) => {
        const box = await page.locator(`[data-tap="${zoneId}"]`).boundingBox();
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        for (let i = 0; i < times; i++) {
            await page.mouse.move(x, y);
            await page.mouse.down();
            await page.mouse.move(x + 200, y + 300); // slides off before lifting
            await page.mouse.up();
            await page.waitForTimeout(90);
        }
    };

    await pressWithoutClick(1, 16);
    await pressWithoutClick(2, 3);
    await pressWithoutClick(3, 7);

    assert.equal(
        await page.locator('#password-modal.show').isVisible(),
        true,
        'presses must count even when no click event follows'
    );
});

test('the hidden corners opt out of double-tap zoom', async (t) => {
    const { server, port } = await startStaticServer();
    const browser = await chromium.launch({ executablePath: CHROME });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

    t.after(async () => {
        await browser.close();
        server.close();
    });

    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForSelector('[data-tap="1"]');

    for (const zoneId of [1, 2, 3]) {
        const touchAction = await page
            .locator(`[data-tap="${zoneId}"]`)
            .evaluate((el) => getComputedStyle(el).touchAction);

        assert.equal(
            touchAction,
            'manipulation',
            `corner ${zoneId} must opt out of double-tap zoom so rapid taps are not swallowed`
        );
    }
});
