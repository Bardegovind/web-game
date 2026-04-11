const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const MasterPassword = require('../models/MasterPassword');

/**
 * POST /api/auth/verify-password
 * Verifies the master password and returns a JWT token
 */
const verifyPassword = async (req, res) => {
    try {
        const { password, username } = req.body;

        if (!password || !username) {
            return res.status(400).json({
                success: false,
                message: 'Password and username are required.',
            });
        }

        // Validate username (alphanumeric, 2-20 chars)
        const usernameRegex = /^[a-zA-Z0-9_]{2,20}$/;
        if (!usernameRegex.test(username)) {
            return res.status(400).json({
                success: false,
                message: 'Username must be 2-20 characters (letters, numbers, underscores only).',
            });
        }

        // Get the stored master password hash
        const masterRecord = await MasterPassword.findOne();

        if (!masterRecord) {
            return res.status(500).json({
                success: false,
                message: 'Master password not configured. Contact admin.',
            });
        }

        // Compare provided password with stored hash
        const isMatch = await bcrypt.compare(password, masterRecord.passwordHash);

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Incorrect password.',
            });
        }

        // Generate JWT token (valid for 24 hours)
        const token = jwt.sign(
            { username: username.toLowerCase() },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        return res.status(200).json({
            success: true,
            message: 'Access granted. Welcome to the Secret Chamber.',
            token,
            username: username.toLowerCase(),
        });
    } catch (error) {
        console.error('Auth Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error. Please try again.',
        });
    }
};

module.exports = { verifyPassword };
