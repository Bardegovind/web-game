'use strict';

/**
 * Proof that hostile content cannot execute in the chamber.
 *
 * These matter more here than in most apps. Messages and captions are stored,
 * so anything that executes does so every time the page is opened, and the
 * token that guards the whole chamber sits in localStorage where injected
 * script can simply read it.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');

const FRONTEND = path.join(__dirname, '..', '..', '..', 'frontend');
const CHROME = '/usr/bin/google-chrome';
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

function startStaticServer() {
    const server = http.createServer((req, res) => {
        const rel = decodeURIComponent(req.url.split('?')[0]);
        const file = path.join(FRONTEND, rel === '/' ? 'index.html' : rel);
        if (!file.startsWith(FRONTEND) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            res.writeHead(200, { 'Content-Type': MIME['.js'] });
            return res.end('window.io = function () { return { on(){}, emit(){}, disconnect(){} }; };');
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(fs.readFileSync(file));
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

async function openChamber(t) {
    const { server, port } = await startStaticServer();
    const browser = await chromium.launch({ executablePath: CHROME });
    const page = await browser.newPage();
    t.after(async () => { await browser.close(); server.close(); });

    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForSelector('#board .cell');
    return page;
}

const PAYLOAD = '<img src=x onerror="window.__executed = true">';

test('a hostile message renders as text and does not execute', async (t) => {
    const page = await openChamber(t);

    await page.evaluate((payload) => {
        chat.currentUsername = 'her';
        chat.appendMessage({
            _id: 'hostile',
            sender: 'him',
            type: 'text',
            text: payload,
            createdAt: new Date().toISOString(),
        });
    }, PAYLOAD);

    await page.waitForTimeout(200);

    assert.equal(
        await page.evaluate(() => window.__executed),
        undefined,
        'injected script must not run — it would read the chamber token out of localStorage'
    );

    const shown = await page.locator('#hostile').innerText();
    assert.ok(shown.includes('<img'), 'the message should be displayed literally, as she would have seen it typed');
});

test('a hostile image url cannot break out of the message markup', async (t) => {
    const page = await openChamber(t);

    await page.evaluate(() => {
        chat.currentUsername = 'her';
        chat.appendMessage({
            _id: 'hostile-image',
            sender: 'him',
            type: 'image',
            // A single quote used to escape the inline onclick handler entirely.
            fileUrl: "x' onerror='window.__executed = true",
            createdAt: new Date().toISOString(),
        });
    });

    await page.waitForTimeout(200);

    assert.equal(await page.evaluate(() => window.__executed), undefined, 'a crafted url must not become code');
});

test('a hostile gallery caption does not execute', async (t) => {
    const page = await openChamber(t);

    await page.evaluate((payload) => {
        gallery.images = [{ _id: 'g1', url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', caption: payload }];
        gallery.renderImages();
    }, PAYLOAD);

    await page.waitForTimeout(200);

    assert.equal(await page.evaluate(() => window.__executed), undefined, 'a caption is text, never markup');
});

test('a hostile gallery url does not execute', async (t) => {
    const page = await openChamber(t);

    await page.evaluate(() => {
        gallery.images = [{
            _id: 'g2',
            url: 'x" onerror="window.__executed = true',
            caption: 'ordinary caption',
        }];
        gallery.renderImages();
    });

    await page.waitForTimeout(300);

    assert.equal(await page.evaluate(() => window.__executed), undefined, 'a crafted url must not become an attribute');
});

test('ordinary messages still render normally', async (t) => {
    const page = await openChamber(t);

    await page.evaluate(() => {
        chat.currentUsername = 'her';
        chat.appendMessage({
            _id: 'normal',
            sender: 'him',
            type: 'text',
            text: 'i made something for you ❤️\nhope you like it',
            createdAt: new Date().toISOString(),
        });
    });

    const shown = await page.locator('#normal').innerText();
    assert.ok(shown.includes('i made something for you ❤️'), 'real messages must be unaffected');
    assert.ok(shown.includes('hope you like it'), 'line breaks should still separate lines');
});
