'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { PassThrough } = require('node:stream');

const { createCloudinaryStorage } = require('../utils/cloudinaryStorage');

/** A stand-in for cloudinary's upload_stream, which is callback-and-stream based. */
function fakeCloudinary({ result, error } = {}) {
    const calls = [];
    return {
        calls,
        uploader: {
            upload_stream(options, callback) {
                calls.push(options);
                const sink = new PassThrough();
                sink.on('finish', () => {
                    if (error) return callback(error);
                    callback(null, result || {
                        secure_url: 'https://res.cloudinary.com/x/image/upload/abc.jpg',
                        public_id: 'secret-chamber-gallery/abc',
                        bytes: 1234,
                        format: 'jpg',
                    });
                });
                sink.resume();
                return sink;
            },
            destroy(publicId, callback) {
                calls.push({ destroyed: publicId });
                callback(null, { result: 'ok' });
            },
        },
    };
}

const fileFrom = (text) => ({
    originalname: 'photo.jpg',
    mimetype: 'image/jpeg',
    stream: Readable.from([Buffer.from(text)]),
});

test('an uploaded file comes back with the url and id the app stores', async () => {
    const cloudinary = fakeCloudinary();
    const storage = createCloudinaryStorage({ cloudinary, folder: 'secret-chamber-gallery' });

    const info = await new Promise((resolve, reject) => {
        storage._handleFile({}, fileFrom('bytes'), (err, result) => (err ? reject(err) : resolve(result)));
    });

    assert.equal(info.path, 'https://res.cloudinary.com/x/image/upload/abc.jpg');
    assert.equal(info.filename, 'secret-chamber-gallery/abc');
    assert.equal(info.size, 1234);
});

test('uploads go to the configured folder', async () => {
    const cloudinary = fakeCloudinary();
    const storage = createCloudinaryStorage({ cloudinary, folder: 'somewhere-else' });

    await new Promise((resolve, reject) => {
        storage._handleFile({}, fileFrom('bytes'), (err) => (err ? reject(err) : resolve()));
    });

    assert.equal(cloudinary.calls[0].folder, 'somewhere-else');
});

test('large images are capped rather than stored at full size', async () => {
    const cloudinary = fakeCloudinary();
    const storage = createCloudinaryStorage({ cloudinary });

    await new Promise((resolve) => storage._handleFile({}, fileFrom('bytes'), resolve));

    const transformation = cloudinary.calls[0].transformation;
    assert.ok(Array.isArray(transformation), 'a transformation should be applied');
    assert.equal(transformation[0].crop, 'limit', 'limit keeps the aspect ratio and never enlarges');
});

test('only the allowed formats are accepted', async () => {
    const cloudinary = fakeCloudinary();
    const storage = createCloudinaryStorage({ cloudinary });

    await new Promise((resolve) => storage._handleFile({}, fileFrom('bytes'), resolve));

    const formats = cloudinary.calls[0].allowed_formats;
    assert.ok(formats.includes('jpg') && formats.includes('png'));
    assert.ok(!formats.includes('svg'), 'an svg can carry script, so it is not an image we accept');
});

test('a failed upload is reported rather than swallowed', async () => {
    const cloudinary = fakeCloudinary({ error: new Error('cloudinary said no') });
    const storage = createCloudinaryStorage({ cloudinary });

    await assert.rejects(
        () => new Promise((resolve, reject) => {
            storage._handleFile({}, fileFrom('bytes'), (err) => (err ? reject(err) : resolve()));
        }),
        /cloudinary said no/
    );
});

/** Multer removes already-written files when a later part of the request fails. */
test('removing a file deletes it from cloudinary', async () => {
    const cloudinary = fakeCloudinary();
    const storage = createCloudinaryStorage({ cloudinary });

    await new Promise((resolve, reject) => {
        storage._removeFile({}, { filename: 'secret-chamber-gallery/abc' }, (err) =>
            (err ? reject(err) : resolve()));
    });

    assert.deepEqual(cloudinary.calls[0], { destroyed: 'secret-chamber-gallery/abc' });
});
