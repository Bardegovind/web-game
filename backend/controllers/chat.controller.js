const Message = require('../models/Message');
const ChamberUser = require('../models/ChamberUser');

/**
 * GET /api/chat/messages/:otherUser
 * Get DM history between current user and another user
 */
const getMessages = async (req, res) => {
    try {
        const { otherUser } = req.params;
        const currentUser = req.user.username;

        // Fetch messages between the two users (both directions), sorted oldest first
        const messages = await Message.find({
            $or: [
                { sender: currentUser, receiver: otherUser },
                { sender: otherUser, receiver: currentUser },
            ],
        }).sort({ createdAt: 1 }).limit(200); // limit to last 200 messages

        return res.status(200).json({
            success: true,
            count: messages.length,
            messages,
        });
    } catch (error) {
        console.error('Chat Fetch Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch messages.',
        });
    }
};

/**
 * GET /api/chat/users
 * Get all chamber users (for DM list)
 */
const getUsers = async (req, res) => {
    try {
        const currentUser = req.user.username;

        // Get all users except the current one
        const users = await ChamberUser.find(
            { username: { $ne: currentUser } },
            { username: 1, isOnline: 1, lastSeen: 1 }
        ).sort({ isOnline: -1, lastSeen: -1 });

        return res.status(200).json({
            success: true,
            users,
        });
    } catch (error) {
        console.error('Users Fetch Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch users.',
        });
    }
};

module.exports = { getMessages, getUsers };
