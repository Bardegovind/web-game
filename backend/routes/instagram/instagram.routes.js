const express = require('express');
const router = express.Router();
const instagramController = require('../../controllers/instagram/instagram.controller');
const authMiddleware = require('../../middleware/auth.middleware');

// Public route for OAuth callback (redirected from Meta, so no JWT header)
router.get('/callback', instagramController.callback);

// Protected routes
router.use(authMiddleware);
router.get('/connect', instagramController.connect);
router.get('/', instagramController.getConnection);
router.delete('/', instagramController.disconnect);
router.post('/sync', instagramController.sync);
router.get('/reels', instagramController.getReels);

module.exports = router;
