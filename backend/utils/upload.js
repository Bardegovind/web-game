'use strict';

const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { createCloudinaryStorage } = require('./cloudinaryStorage');

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const upload = multer({
    storage: createCloudinaryStorage({ cloudinary }),
    limits: {
        fileSize: MAX_FILE_BYTES,
        // One photograph per request. Without this a single upload can carry
        // arbitrarily many parts.
        files: 1,
    },
});

module.exports = upload;
