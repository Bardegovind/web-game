'use strict';

const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const Message = require('../models/Message');
const ChamberUser = require('../models/ChamberUser');
const UserConversation = require('../models/UserConversation');

const { createChatService, conversationKeyFor } = require('../services/chat.service');
const { createPresenceService } = require('../services/presence.service');
const { createTypingService } = require('../services/typing.service');

const { EVENTS, roomFor } = require('./events');
const { registerChatHandlers } = require('./chat.handlers');
const { registerTypingHandlers } = require('./typing.handlers');
const { registerPresenceHandlers } = require('./presence.handlers');

/**
 * Wires up the realtime layer.
 *
 * Everything routes through rooms keyed by user, which is what makes multiple
 * tabs work and what lets the Redis adapter be dropped in later without any of
 * this code changing.
 */
function createSocketServer(deps) {
    const { httpServer, allowedOrigins, jwtSecret } = deps;

    const io = new Server(httpServer, allowedOrigins && allowedOrigins.length > 0
        ? { cors: { origin: allowedOrigins, methods: ['GET', 'POST'], credentials: true } }
        : {});

    const chat = createChatService({ Message, UserConversation });
    const presence = createPresenceService({ io, ChamberUser });
    const typing = createTypingService({ io });

    io.use((socket, next) => {
        const token = socket.handshake.auth && socket.handshake.auth.token;
        if (!token) return next(new Error('Authentication required'));

        try {
            const decoded = jwt.verify(token, jwtSecret);
            socket.user = decoded; // { sub, username }
            return next();
        } catch {
            return next(new Error('Invalid token'));
        }
    });

    io.on('connection', (socket) => {
        // Listeners are attached synchronously, before anything is awaited.
        // Awaiting first leaves a window where the client believes it is
        // connected while the server is not yet listening, and the very first
        // message someone sends on opening a chat is silently dropped.
        registerChatHandlers({ socket, io, Message, chat, conversationKeyFor });
        registerTypingHandlers({ socket, typing });

        // Joining the room is also synchronous, so nothing addressed to this
        // user can be missed while presence is being written.
        socket.join(roomFor(socket.user.username));

        registerPresenceHandlers({ socket, presence, typing, roomFor })
            .catch((error) => console.error('Presence setup error:', error));
    });

    return { io, presence, typing, chat };
}

module.exports = { createSocketServer, EVENTS, roomFor };
