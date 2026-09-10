'use strict';

const Message = require('../models/Message');
const ChamberUser = require('../models/ChamberUser');
const User = require('../models/User');
const UserConversation = require('../models/UserConversation');
const { createChatService } = require('../services/chat.service');

const chat = createChatService({ Message, UserConversation });

const HISTORY_LIMIT = 200;

/**
 * GET /api/chat/messages/:otherUser?before=<iso>
 *
 * The most recent slice of a conversation, oldest-first. `before` pages further
 * back, so a long history can be walked without loading all of it.
 */
const getMessages = async (req, res) => {
    try {
        const peer = String(req.params.otherUser || '').toLowerCase();
        const me = req.user.username;

        const before = req.query.before ? new Date(req.query.before) : null;
        const validBefore = before && !Number.isNaN(before.getTime()) ? before : null;

        const messages = await chat.history({
            me,
            peer,
            limit: HISTORY_LIMIT,
            before: validBefore,
        });

        return res.status(200).json({
            success: true,
            count: messages.length,
            messages,
            // Present only when there may be older messages to page back to.
            nextCursor: messages.length === HISTORY_LIMIT ? messages[0].createdAt : null,
        });
    } catch (error) {
        console.error('Chat Fetch Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch messages.' });
    }
};

/**
 * GET /api/chat/conversations
 *
 * Everything the sidebar and the unread badge need, in one request: who the
 * other people are, whether they are online, and how many messages are waiting.
 */
const getConversations = async (req, res) => {
    try {
        const me = req.user.username;

        // Who exists is decided by the accounts, not by who has opened a socket.
        // ChamberUser only gets a row once someone connects, so relying on it
        // meant a person you had never chatted with simply was not there.
        const [accounts, presence] = await Promise.all([
            User.find({ username: { $ne: me } }, { username: 1 }).lean(),
            ChamberUser.find({}, { username: 1, isOnline: 1, lastSeen: 1 }).lean(),
        ]);

        const presenceFor = new Map(presence.map((p) => [p.username, p]));

        const peers = accounts.length > 0
            ? accounts.map((a) => ({ ...presenceFor.get(a.username), username: a.username }))
            : presence.filter((p) => p.username !== me);

        const conversations = await Promise.all(peers.map(async (peer) => {
            const [unreadCount, recent] = await Promise.all([
                chat.unreadCount({ me, peer: peer.username }),
                chat.history({ me, peer: peer.username, limit: 1 }),
            ]);

            const lastMessage = recent[0] || null;

            return {
                username: peer.username,
                isOnline: Boolean(peer.isOnline),
                lastSeen: peer.lastSeen,
                unreadCount,
                lastMessage: lastMessage
                    ? {
                        text: lastMessage.type === 'image' ? '📷 Photo' : lastMessage.text,
                        sender: lastMessage.sender,
                        createdAt: lastMessage.createdAt,
                    }
                    : null,
                lastMessageAt: lastMessage ? lastMessage.createdAt : null,
            };
        }));

        return res.status(200).json({ success: true, conversations });
    } catch (error) {
        console.error('Conversations Fetch Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch conversations.' });
    }
};

/**
 * POST /api/chat/read/:otherUser
 *
 * Records that she has seen this conversation. Stored, so the badge is still
 * right after a refresh or a reconnect.
 */
const markRead = async (req, res) => {
    try {
        const peer = String(req.params.otherUser || '').toLowerCase();
        const at = await chat.markRead({ me: req.user.username, peer });

        return res.status(200).json({ success: true, lastReadAt: at });
    } catch (error) {
        console.error('Mark Read Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to update read state.' });
    }
};

/** GET /api/chat/users — kept for compatibility with the current frontend. */
const getUsers = async (req, res) => {
    try {
        const users = await ChamberUser.find(
            { username: { $ne: req.user.username } },
            { username: 1, isOnline: 1, lastSeen: 1 }
        ).sort({ isOnline: -1, lastSeen: -1 });

        return res.status(200).json({ success: true, users });
    } catch (error) {
        console.error('Users Fetch Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch users.' });
    }
};

module.exports = { getMessages, getUsers, getConversations, markRead };
