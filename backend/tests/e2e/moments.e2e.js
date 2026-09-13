'use strict';

/**
 * Moments — a visible "Add photo" button, and a description with every photo.
 *
 * A user screenshot showed only a thin orange sliver of the add button, under
 * the new bottom navigation bar: the button was `fixed` to the viewport, and
 * the bar (added later, in normal flow) painted over it. This also covers the
 * feature asked for alongside the fix: an optional description, added in a
 * sheet before the photo uploads. Real server, real database, the real built
 * frontend, real Chrome. Cloudinary is never reached — uploads are
 * intercepted at the network layer.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright-core');

const { isReachable, SKIP_MESSAGE } = require('../integration/requireMongo');
const { createChamberSession } = require('./support/chamberSession');

const CHROME = '/usr/bin/google-chrome';
const DIST = path.join(__dirname, '..', '..', '..', 'frontend', 'dist', 'index.html');
const MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27018/wg_moments_e2e';

const session = createChamberSession({ port: 5088, mongoUri: MONGO_URI, jwtSecret: 'moments-e2e-secret' });
const { HIM, HIS_PASSWORD } = session;

// A 1x1 transparent PNG.
const TINY_PNG_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const TINY_PNG = Buffer.from(TINY_PNG_BASE64, 'base64');
const TINY_PNG_DATA_URI = `data:image/png;base64,${TINY_PNG_BASE64}`;

/** Rejects with `message` if `promise` has not settled within `ms`. */
function withTimeout(promise, ms, message) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message || `timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Intercepts every upload attempt instead of letting it reach Cloudinary.
 * Records each request's raw multipart body and replies with `status`/`body`
 * (from the mutable `response` ref, so a test can flip it between subtests).
 * When `hold.promise` is set, the reply waits for it to resolve first, so a
 * test can hold a request open to check what happens while it is in flight.
 */
async function interceptUploads(page, response, hold) {
    const requests = [];

    await page.route('**/api/gallery/upload', async (route) => {
        const body = route.request().postDataBuffer();
        requests.push(body ? body.toString('latin1') : '');

        if (hold.promise) await hold.promise;

        await route.fulfill({
            status: response.status,
            contentType: 'application/json',
            body: JSON.stringify(response.body),
        });
    });

    return requests;
}

function successBody(caption) {
    return {
        success: true,
        image: {
            _id: 'e2e-photo',
            url: TINY_PNG_DATA_URI,
            caption,
            createdAt: new Date().toISOString(),
            uploadedBy: HIM,
        },
    };
}

async function openMoments(page) {
    await session.enterChamber(page, HIM, HIS_PASSWORD);
    await page.locator('nav[aria-label="Chamber sections"] [aria-label="Moments"]').click();
    await page.waitForTimeout(500);
}

function addPhotoButton(page) {
    return page.getByRole('button', { name: 'Add photo' });
}

async function chooseAPhoto(page) {
    await page.setInputFiles('input[type="file"][accept="image/*"]', {
        name: 'moment.png',
        mimeType: 'image/png',
        buffer: TINY_PNG,
    });
}

function dialog(page) {
    return page.locator('.chamber-root [role="dialog"]');
}

test('Moments: a visible add-photo button, with a description', { timeout: 120_000 }, async (t) => {
    if (!(await isReachable(MONGO_URI))) return t.skip(SKIP_MESSAGE);
    if (!fs.existsSync(DIST)) return t.skip('needs a built frontend: cd frontend && npm run build');

    await session.resetDatabase();
    await session.startServer();

    const browser = await chromium.launch({ executablePath: CHROME });
    const pageErrors = [];

    t.after(async () => {
        await browser.close();
        session.stopServer();
    });

    await t.test('the button is visible above the bar, on desktop and on phone', async () => {
        async function checkViewport(name, contextOptions) {
            const context = await browser.newContext(contextOptions);
            const page = await context.newPage();
            page.on('pageerror', (error) => pageErrors.push(`[${name}] ${error.message}`));

            try {
                await withTimeout(openMoments(page), 20_000, `${name}: opening Moments timed out`);

                const button = addPhotoButton(page);
                await button.waitFor({ state: 'visible', timeout: 8000 });

                const box = await button.boundingBox();
                assert.ok(box, `${name}: the add-photo button should be laid out`);

                const buttonHandle = await button.elementHandle();
                const hitsButton = await page.evaluate(
                    ([el, x, y]) => {
                        const hit = document.elementFromPoint(x, y);
                        return !!hit && (hit === el || el.contains(hit));
                    },
                    [buttonHandle, box.x + box.width / 2, box.y + box.height / 2]
                );
                assert.ok(hitsButton, `${name}: the point at the button's centre should hit the button, not something covering it`);

                const barBox = await page.locator('nav[aria-label="Chamber sections"]').boundingBox();
                assert.ok(barBox, `${name}: the bottom bar should be laid out`);
                assert.ok(
                    box.y + box.height <= barBox.y + 1,
                    `${name}: the button's bottom (${box.y + box.height}) should be at or above the bar's top (${barBox.y})`
                );
            } finally {
                await context.close();
            }
        }

        await checkViewport('desktop', { viewport: { width: 1280, height: 800 } });
        await checkViewport('phone', { viewport: { width: 390, height: 844, isMobile: true, hasTouch: true } });
    });

    const context = await browser.newContext({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true } });
    const page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push(error.message));

    const response = { status: 201, body: successBody('') };
    const hold = { promise: null };
    const requests = await interceptUploads(page, response, hold);

    await withTimeout(openMoments(page), 20_000, 'opening Moments timed out');

    await t.test('choosing a photo opens a sheet, and uploads nothing yet', async () => {
        await chooseAPhoto(page);

        const sheet = dialog(page);
        await sheet.waitFor({ state: 'visible', timeout: 8000 });

        await sheet.locator('img[alt="Selected photo"]').waitFor({ timeout: 4000 });
        await sheet.locator('textarea[aria-label="Description"]').waitFor({ timeout: 4000 });
        await sheet.getByText('Add a photo').first().waitFor({ timeout: 4000 });

        assert.equal(requests.length, 0, 'no upload should have happened yet');
    });

    await t.test('the description is sent along with the photo', async () => {
        response.status = 201;
        response.body = successBody('Our first cake together');

        const sheet = dialog(page);
        await sheet.locator('textarea[aria-label="Description"]').fill('Our first cake together');
        await sheet.getByRole('button', { name: 'Add photo' }).click();

        await sheet.waitFor({ state: 'hidden', timeout: 8000 });

        assert.equal(requests.length, 1, 'exactly one upload should have happened');
        const body = requests[0];
        assert.match(body, /name="caption"/);
        assert.match(body, /name="caption"[\s\S]*?Our first cake together/);
        assert.match(body, /name="image"/);

        const toastTitle = page.locator('[data-sonner-toast] [data-title]', { hasText: 'Photo added' });
        await toastTitle.waitFor({ timeout: 5000 });
    });

    await t.test('cancel uploads nothing', async () => {
        const before = requests.length;

        await chooseAPhoto(page);
        const sheet = dialog(page);
        await sheet.waitFor({ state: 'visible', timeout: 8000 });
        await sheet.locator('textarea[aria-label="Description"]').fill('never sent');

        await sheet.getByRole('button', { name: 'Cancel' }).click();
        await sheet.waitFor({ state: 'hidden', timeout: 8000 });

        assert.equal(requests.length, before, 'cancel should not upload');
    });

    await t.test('a failed upload keeps what she wrote', async () => {
        response.status = 500;
        response.body = { success: false };

        await chooseAPhoto(page);
        const sheet = dialog(page);
        await sheet.waitFor({ state: 'visible', timeout: 8000 });
        await sheet.locator('textarea[aria-label="Description"]').fill('keep me');

        await sheet.getByRole('button', { name: 'Add photo' }).click();

        const alert = sheet.locator('[role="alert"]', { hasText: "Couldn't add this photo. Try again." });
        await alert.waitFor({ timeout: 8000 });

        await page.waitForTimeout(300);
        assert.ok(await sheet.isVisible(), 'the sheet should stay open after a failure');
        assert.equal(await sheet.locator('textarea[aria-label="Description"]').inputValue(), 'keep me');
    });

    await t.test('closing the sheet mid-upload does not lose the result', async () => {
        let releaseUpload;
        hold.promise = new Promise((resolve) => { releaseUpload = resolve; });
        response.status = 500;
        response.body = { success: false };

        await chooseAPhoto(page);
        const sheet = dialog(page);
        await sheet.waitFor({ state: 'visible', timeout: 8000 });
        await sheet.locator('textarea[aria-label="Description"]').fill('still here');

        await sheet.getByRole('button', { name: 'Add photo' }).click();
        // The request is held open server-side; give the click a moment to
        // actually start the mutation before trying to dismiss the sheet.
        await page.waitForTimeout(300);

        // 500ms comfortably clears the sheet's own 200ms exit animation, so a
        // close that the guard failed to stop has fully unmounted the dialog
        // by the time we check — not just started sliding away.
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        assert.ok(await sheet.isVisible(), 'Escape should not close the sheet while the upload is in flight');

        // The overlay covers everywhere outside the sheet's own bottom panel;
        // a point near the top of the viewport is reliably clear of it.
        await page.mouse.click(10, 10);
        await page.waitForTimeout(500);
        assert.ok(await sheet.isVisible(), 'an overlay click should not close the sheet while the upload is in flight');

        releaseUpload();
        hold.promise = null;

        const alert = sheet.locator('[role="alert"]', { hasText: "Couldn't add this photo. Try again." });
        await alert.waitFor({ timeout: 8000 });
        assert.equal(
            await sheet.locator('textarea[aria-label="Description"]').inputValue(),
            'still here',
            'the description typed before the failed upload should survive'
        );
    });

    await context.close();

    await t.test('nothing threw', () => {
        assert.deepEqual(pageErrors, []);
    });
});
