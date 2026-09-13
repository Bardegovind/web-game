'use strict';

/**
 * The installable app.
 *
 * Two things matter here and they pull in opposite directions: it must work
 * with no signal, and it must never keep a copy of anything private. So the
 * shell is cached and her data is not — which is worth asserting rather than
 * trusting, because a cache entry is a copy on disk that outlives the session.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const mongoose = require('mongoose');
const { chromium } = require('playwright-core');

const { isReachable, SKIP_MESSAGE } = require('../integration/requireMongo');

const MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27018/wg_pwa_e2e';
const PORT = 5089;
const BASE = `http://127.0.0.1:${PORT}`;
const CHROME = '/usr/bin/google-chrome';
const DIST = path.join(__dirname, '..', '..', '..', 'frontend', 'dist', 'index.html');

const HER = 'radhe';
const HER_PASSWORD = 'her-secret-password';

const SERVER_ENV = {
    ...process.env,
    MONGO_URI,
    PORT: String(PORT),
    JWT_SECRET: 'pwa-e2e-secret',
    MASTER_PASSWORD: 'legacy-master',
    USER_A_NAME: HER,
    USER_A_PASSWORD: HER_PASSWORD,
    USER_B_NAME: 'govind',
    USER_B_PASSWORD: 'his-password',
    CLOUDINARY_CLOUD_NAME: 'unused',
    CLOUDINARY_API_KEY: 'unused',
    CLOUDINARY_API_SECRET: 'unused',
    // Set, so dotenv cannot supply one from backend/.env; empty means no Redis.
    REDIS_URL: '',
};

let child = null;

async function startServer() {
    child = spawn('node', ['server.js'], {
        cwd: path.join(__dirname, '..', '..'),
        env: SERVER_ENV,
        stdio: ['ignore', 'ignore', 'pipe'],
    });
    child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        try {
            if ((await fetch(`${BASE}/api/health`)).ok) return;
        } catch { /* not up yet */ }
        await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('server did not become healthy');
}

test('the installable app', async (t) => {
    if (!(await isReachable(MONGO_URI))) return t.skip(SKIP_MESSAGE);
    if (!fs.existsSync(DIST)) return t.skip('needs a built frontend: cd frontend && npm run build');

    await mongoose.connect(MONGO_URI);
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();

    await startServer();

    const browser = await chromium.launch({ executablePath: CHROME });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

    t.after(async () => {
        await browser.close();
        if (child) child.kill('SIGKILL');
    });

    await page.goto(BASE);
    await page.waitForSelector('#board .cell');

    /**
     * Installed, it must look like the game and nothing else. An entry called
     * "Our Place" with a heart on it would hand the secret to anyone glancing
     * at her home screen.
     */
    await t.test('the installed app is the game, and gives nothing away', async () => {
        const res = await fetch(`${BASE}/manifest.webmanifest`);
        assert.equal(res.ok, true, 'the manifest should be served');

        const manifest = await res.json();
        assert.equal(manifest.name, 'Tic Tac Toe');
        assert.equal(manifest.short_name, 'Tic Tac Toe');
        assert.equal(manifest.display, 'standalone');

        const text = JSON.stringify(manifest).toLowerCase();
        for (const giveaway of ['chamber', 'secret', 'ours', 'letter', 'love', 'radhe', 'govind']) {
            assert.ok(!text.includes(giveaway), `the manifest must not mention "${giveaway}"`);
        }
    });

    await t.test('the icons are real images', async () => {
        for (const icon of ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png']) {
            const res = await fetch(`${BASE}${icon}`);
            assert.equal(res.ok, true, `${icon} should be served`);
            assert.ok((await res.arrayBuffer()).byteLength > 1000, `${icon} should have real content`);
        }
    });

    await t.test('the service worker takes over', async () => {
        await page.waitForFunction(
            () => navigator.serviceWorker.controller !== null,
            undefined,
            { timeout: 10000 }
        );

        const scope = await page.evaluate(async () => {
            const registration = await navigator.serviceWorker.ready;
            return registration.scope;
        });

        assert.ok(scope.endsWith('/'), 'it should control the whole origin');
    });

    await t.test('the shell is cached, so the game opens with no signal', async () => {
        const cached = await page.evaluate(async () => {
            const names = await caches.keys();
            const entries = [];
            for (const name of names) {
                const cache = await caches.open(name);
                entries.push(...(await cache.keys()).map((r) => new URL(r.url).pathname));
            }
            return entries;
        });

        assert.ok(cached.some((p) => p === '/' || p === '/index.html'), 'the page itself should be cached');
    });

    /**
     * The one that matters. Those responses are her messages, her photographs
     * and her letters; a cache entry is a copy on disk that outlives the
     * session and is readable by anyone who later has the device.
     */
    await t.test('nothing private is ever written to the cache', async () => {
        // Sign in properly so real API traffic happens.
        for (const [zone, times] of [[1, 16], [2, 3], [3, 7]]) {
            const box = await page.locator(`[data-tap="${zone}"]`).boundingBox();
            for (let i = 0; i < times; i++) {
                await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { delay: 3 });
                await page.waitForTimeout(30);
            }
        }
        await page.waitForSelector('#password-modal.show', { timeout: 4000 });
        await page.fill('#input-username', HER);
        await page.fill('#input-password', HER_PASSWORD);
        await page.click('#btn-submit-password');
        await page.waitForSelector('text=ours', { timeout: 8000 });
        await page.waitForTimeout(2000);

        const cached = await page.evaluate(async () => {
            const names = await caches.keys();
            const entries = [];
            for (const name of names) {
                const cache = await caches.open(name);
                entries.push(...(await cache.keys()).map((r) => new URL(r.url).pathname));
            }
            return entries;
        });

        const leaked = cached.filter((p) => p.startsWith('/api/') || p.startsWith('/socket.io/'));
        assert.deepEqual(leaked, [], `her data must never be cached, found: ${leaked.join(', ')}`);
    });
});
