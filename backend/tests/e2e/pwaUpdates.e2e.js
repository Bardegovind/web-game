'use strict';

/**
 * Whether a fix actually reaches her phone.
 *
 * The service worker served every file cache-first, on the assumption that
 * built assets carry a content hash in their names. The React bundle does. The
 * game's own scripts do not: /js/tapZones.js keeps the same name in every
 * release. So once her phone had cached it, every later fix to the corners —
 * the larger targets, the haptics — would never be loaded again, however many
 * times the app was reopened.
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

/**
 * Serves the build with two controls: the corner script is stamped with a
 * release marker the test can change, and the whole server can be taken
 * offline by dropping every connection.
 */
function startReleaseServer() {
    const state = { release: 'A', online: true };

    const server = http.createServer((req, res) => {
        if (!state.online) {
            req.socket.destroy();
            return;
        }

        const rel = decodeURIComponent(req.url.split('?')[0]);
        const file = path.join(FRONTEND, rel === '/' ? 'index.html' : rel);

        if (!file.startsWith(FRONTEND) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            res.writeHead(200, { 'Content-Type': MIME['.js'] });
            return res.end('window.io = function () { return { on(){}, emit(){}, disconnect(){}, io:{on(){}} }; };');
        }

        let body = fs.readFileSync(file);
        if (rel === '/js/tapZones.js') {
            body = Buffer.concat([body, Buffer.from(`\n;window.__tapZonesRelease = '${state.release}';\n`)]);
        }

        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(body);
    });

    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, state }));
    });
}

const runningRelease = (page) => page.evaluate(() => window.__tapZonesRelease);

test('a returning phone picks up a new release of the game scripts', async (t) => {
    if (!fs.existsSync(path.join(FRONTEND, 'index.html'))) {
        return t.skip('needs a built frontend: cd frontend && npm run build');
    }

    const { server, port, state } = await startReleaseServer();
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

    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForSelector('#board .cell');
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 10000 });

    // Once the worker controls the page, a reload routes every script through it
    // and into its cache. This is her phone after the first visit.
    await page.reload();
    await page.waitForSelector('#board .cell');

    await t.test('the first release is what she runs', async () => {
        assert.equal(await runningRelease(page), 'A');
    });

    await t.test('after a new release, reopening with signal runs the new code', async () => {
        state.release = 'B';

        await page.reload();
        await page.waitForSelector('#board .cell');

        assert.equal(
            await runningRelease(page),
            'B',
            'a cached copy of the corner script must not outlive the release that replaced it'
        );
    });

    await t.test('with no signal, the game still opens from the cache', async () => {
        state.online = false;

        await page.reload();
        await page.waitForSelector('#board .cell', { timeout: 10000 });

        assert.equal(await runningRelease(page), 'B', 'offline, she gets the last release she had');
    });
});
