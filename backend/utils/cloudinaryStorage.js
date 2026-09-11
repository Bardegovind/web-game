'use strict';

/**
 * A multer storage engine that writes straight to Cloudinary.
 *
 * Replaces multer-storage-cloudinary, which pins cloudinary v1 and so cannot be
 * used alongside the v2 client that carries the security fix. The wrapper was
 * doing very little — this is that little, against the current API, with no
 * third-party dependency left to go stale.
 */

const DEFAULT_FOLDER = 'secret-chamber-gallery';

// No svg: it is markup, and markup can carry script.
const ALLOWED_FORMATS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'mp4', 'mov'];

// Large enough to look good on any screen, small enough not to store originals.
const MAX_DIMENSION = 1600;

function createCloudinaryStorage(options) {
    const config = options || {};
    const cloudinary = config.cloudinary;
    const folder = config.folder || DEFAULT_FOLDER;

    return {
        _handleFile(req, file, callback) {
            const stream = cloudinary.uploader.upload_stream(
                {
                    folder,
                    allowed_formats: ALLOWED_FORMATS,
                    resource_type: 'auto',
                    // `limit` keeps the aspect ratio and never enlarges a small
                    // photograph to fit.
                    transformation: [{ width: MAX_DIMENSION, height: MAX_DIMENSION, crop: 'limit' }],
                },
                (error, result) => {
                    if (error) return callback(error);

                    callback(null, {
                        // The names multer puts on req.file, so every caller is
                        // unchanged from the previous engine.
                        path: result.secure_url,
                        filename: result.public_id,
                        size: result.bytes,
                        format: result.format,
                    });
                }
            );

            file.stream.on('error', callback);
            file.stream.pipe(stream);
        },

        /** Multer calls this to undo an upload when a later part of the request fails. */
        _removeFile(req, file, callback) {
            cloudinary.uploader.destroy(file.filename, callback);
        },
    };
}

module.exports = { createCloudinaryStorage, ALLOWED_FORMATS, MAX_DIMENSION };
