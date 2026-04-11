const express = require('express');
const router = express.Router();
const { verifyPassword } = require('../controllers/auth.controller');

// POST /api/auth/verify-password
router.post('/verify-password', verifyPassword);

module.exports = router;
