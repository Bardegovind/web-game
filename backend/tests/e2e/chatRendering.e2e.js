'use strict';

/**
 * How the chat actually reads on screen.
 *
 * Covers the two things that looked broken in use: messages from different days
 * appearing to run backwards in time, and the sidebar name colliding with the
 * online status.
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
            return res.end('window.io = function () { return { on(){}, emit(){}, disconnect(){}, io:{on(){}} }; };');
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(fs.readFileSync(file));
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

async function openPage(t) {
    const { server, port } = await startStaticServer();
    const browser = await chromium.launch({ executablePath: CHROME });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    t.after(async () => { await browser.close(); server.close(); });

    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForSelector('#board .cell');
    return page;
}

/**
 * Puts the chamber on screen with the chat tab open. Layout cannot be measured
 * on a hidden element, and these tests are about how things actually look.
 */
async function showChat(page) {
    await page.evaluate(() => {
        document.getElementById('game-view').classList.remove('active');
        document.getElementById('chamber-view').classList.add('active');
        chamber.switchTab('chat');
        document.getElementById('chat-placeholder').style.display = 'none';
        document.getElementById('chat-active').style.display = 'flex';
    });
}

/**
 * The exact shape seen in use: an evening of messages, then the next evening.
 * Read by clock time alone, 10:37 PM followed by 10:07 PM looks like the
 * history is scrambled.
 */
test('messages from different days are separated by a day heading', async (t) => {
    const page = await openPage(t);

    await page.evaluate(() => {
        chat.currentUsername = 'govind';
        chat.lastRenderedAt = null;

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(22, 37, 0, 0);

        const today = new Date();
        today.setHours(22, 7, 0, 0);

        [
            { _id: 'a', sender: 'radhe', type: 'text', text: 'Ok', createdAt: yesterday.toISOString() },
            { _id: 'b', sender: 'radhe', type: 'text', text: 'Hii', createdAt: today.toISOString() },
        ].forEach((m) => chat.appendMessage(m));
    });

    const labels = await page.locator('.day-separator').allInnerTexts();

    assert.equal(labels.length, 2, 'each day should announce itself');
    assert.equal(labels[0].trim(), 'Yesterday');
    assert.equal(labels[1].trim(), 'Today');
});

test('consecutive messages on one day share a single heading', async (t) => {
    const page = await openPage(t);

    await page.evaluate(() => {
        chat.currentUsername = 'govind';
        chat.lastRenderedAt = null;

        const base = new Date();
        [9, 10, 11].forEach((hour, i) => {
            base.setHours(hour, 0, 0, 0);
            chat.appendMessage({
                _id: `m${i}`, sender: 'radhe', type: 'text',
                text: `message ${i}`, createdAt: new Date(base).toISOString(),
            });
        });
    });

    const labels = await page.locator('.day-separator').allInnerTexts();
    assert.equal(labels.length, 1, 'one heading for the day, not one per message');
    assert.equal(labels[0].trim(), 'Today');
});

test('times read without a leading zero', async (t) => {
    const page = await openPage(t);

    await page.evaluate(() => {
        chat.currentUsername = 'govind';
        chat.lastRenderedAt = null;

        const morning = new Date();
        morning.setHours(9, 28, 0, 0);

        chat.appendMessage({
            _id: 'morning', sender: 'radhe', type: 'text',
            text: 'good morning', createdAt: morning.toISOString(),
        });
    });

    const shown = await page.locator('#morning .message-time').innerText();
    assert.equal(shown.trim(), '9:28 AM', 'a clock face shows 9:28, not 09:28');
});

/**
 * The regression: rendering the sidebar as real nodes removed the incidental
 * whitespace a template literal used to provide, so "@radhe" and "Offline" ran
 * together as "@radheOffline".
 */
test('the sidebar name and status do not collide', async (t) => {
    const page = await openPage(t);
    await showChat(page);

    await page.evaluate(async () => {
        // Stand in for the conversations endpoint.
        api.get = async () => ({
            success: true,
            conversations: [{ username: 'radhe', isOnline: false, unreadCount: 3, lastMessage: null }],
        });
        await chat.renderUserList();
    });

    await page.waitForSelector('.user-item-name');

    const name = await page.locator('.user-item-name').boundingBox();
    const status = await page.locator('.user-status-text').boundingBox();

    assert.ok(name && status, 'both should be laid out');
    assert.ok(
        status.y >= name.y + name.height - 1,
        'the status belongs on its own line, not welded to the end of the name'
    );

    const combined = await page.locator('.user-item-info').innerText();
    assert.ok(!combined.includes('@radheOffline'), 'the two must never render as one run-together word');
});

test('an unread count is shown on the conversation', async (t) => {
    const page = await openPage(t);
    await showChat(page);

    await page.evaluate(async () => {
        api.get = async () => ({
            success: true,
            conversations: [{ username: 'radhe', isOnline: true, unreadCount: 5, lastMessage: null }],
        });
        await chat.renderUserList();
    });

    const badge = await page.locator('.user-unread-badge').innerText();
    assert.equal(badge.trim(), '5', 'waiting messages should be visible without opening the chat');
});
