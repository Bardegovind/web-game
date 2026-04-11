const express = require('express');
const router = express.Router();
const { getAllImages, uploadImage, deleteImage } = require('../controllers/gallery.controller');
const authMiddleware = require('../middleware/auth.middleware');
const upload = require('../utils/upload');

// All gallery routes require authentication
router.use(authMiddleware);

// GET /api/gallery — Get all images
router.get('/', getAllImages);

// POST /api/gallery/upload — Upload an image
router.post('/upload', upload.single('image'), uploadImage);

// DELETE /api/gallery/:id — Delete an image
router.delete('/:id', deleteImage);

module.exports = router;
