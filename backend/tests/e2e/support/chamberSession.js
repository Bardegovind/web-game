'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const mongoose = require('mongoose');
const { io: connect } = require('socket.io-client');

const HER = 'radhe';
const HER_PASSWORD = 'her-secret-password';
const HIM = 'govind';
const HIS_PASSWORD = 'his-different-password';

/**
 * A real server on its own port and database, plus the steps a person takes to
 * reach the chamber. Each browser test file creates one with a distinct port.
 */
function createChamberSession({ port, mongoUri, jwtSecret }) {
    const BASE = `http://127.0.0.1:${port}`;
    let child = null;

    const env = {
        ...process.env,
        MONGO_URI: mongoUri,
        PORT: String(port),
        JWT_SECRET: jwtSecret,
        MASTER_PASSWORD: 'legacy-master',
        USER_A_NAME: HER,
        USER_A_PASSWORD: HER_PASSWORD,
        USER_B_NAME: HIM,
        USER_B_PASSWORD: HIS_PASSWORD,
        CLOUDINARY_CLOUD_NAME: 'unused',
        CLOUDINARY_API_KEY: 'unused',
        CLOUDINARY_API_SECRET: 'unused',
        // Set, so dotenv cannot supply one from backend/.env; empty means no Redis.
        REDIS_URL: '',
    };

    async function resetDatabase() {
        await mongoose.connect(mongoUri);
        await mongoose.connection.db.dropDatabase();
        await mongoose.disconnect();
    }

    async function startServer() {
        child = spawn('node', ['server.js'], {
            cwd: path.join(__dirname, '..', '..', '..'),
            env,
            stdio: ['ignore', 'ignore', 'pipe'],
        });
        child.stderr.on('data', (d) => process.stderr.write(`[server:${port}] ${d}`));

        const deadline = Date.now() + 20000;
        while (Date.now() < deadline) {
            try {
                if ((await fetch(`${BASE}/api/health`)).ok) return;
            } catch { /* not up yet */ }
            await new Promise((r) => setTimeout(r, 200));
        }
        throw new Error(`server on ${port} did not become healthy`);
    }

    function stopServer() {
        if (child) child.kill('SIGKILL');
        child = null;
    }

    /** The frozen ritual with real pointer input, the password, and the entrance. */
    async function enterChamber(page, username, password) {
        await page.goto(BASE);
        await page.waitForSelector('#board .cell');

        for (const [zone, times] of [[1, 16], [2, 3], [3, 7]]) {
            const box = await page.locator(`[data-tap="${zone}"]`).boundingBox();
            assert.ok(box, `corner ${zone} should be laid out`);
            for (let i = 0; i < times; i++) {
                await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { delay: 4 });
                await page.waitForTimeout(35);
            }
        }

        await page.waitForSelector('#password-modal.show', { timeout: 4000 });
        await page.fill('#input-username', username);
        await page.fill('#input-password', password);
        await page.click('#btn-submit-password');

        await page.waitForSelector('text=ours', { timeout: 8000 });
        await page.waitForTimeout(1600); // the entrance plays once
    }

    /** Another person, connected over a real socket. */
    async function connectPerson(username, password) {
        const res = await fetch(`${BASE}/api/auth/verify-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        const { token } = await res.json();

        const socket = connect(BASE, { auth: { token }, transports: ['websocket'], forceNew: true });
        await new Promise((resolve, reject) => {
            socket.on('connect', resolve);
            socket.on('connect_error', reject);
        });
        return socket;
    }

    return {
        BASE, HER, HER_PASSWORD, HIM, HIS_PASSWORD,
        resetDatabase, startServer, stopServer, enterChamber, connectPerson,
    };
}

module.exports = { createChamberSession };
