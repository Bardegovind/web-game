const express = require('express');
const router = express.Router();
const { getMessages, getUsers } = require('../controllers/chat.controller');
const authMiddleware = require('../middleware/auth.middleware');
const upload = require('../utils/upload');

// All chat routes require authentication
router.use(authMiddleware);

// GET /api/chat/users — Get all chamber users
router.get('/users', getUsers);

// GET /api/chat/messages/:otherUser — Get DM history
router.get('/messages/:otherUser', getMessages);

// POST /api/chat/upload — Upload image for chat
router.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    res.json({
        success: true,
        fileUrl: req.file.path,
    });
});

module.exports = router;
