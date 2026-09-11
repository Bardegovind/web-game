'use strict';

const { EVENTS, roomFor } = require('./events');
const { applyReaction } = require('../services/reactions');

const MAX_MESSAGE_LENGTH = 4000;

/**
 * Message delivery.
 *
 * Everything goes to rooms rather than to a stored socket id, so every tab and
 * device a person has open receives it — including the sender's own other tabs,
 * which is what stops two open windows from disagreeing about what was said.
 */
function registerChatHandlers(deps) {
    const { socket, io, Message, chat, conversationKeyFor } = deps;
    const me = socket.user.username;

    socket.on(EVENTS.MESSAGE_SEND, async (data, ack) => {
        try {
            const payload = data || {};
            const receiver = payload.receiver;

            if (!receiver || typeof receiver !== 'string') return;

            const to = receiver.toLowerCase();
            const type = payload.type === 'image' ? 'image' : 'text';
            const text = typeof payload.text === 'string'
                ? payload.text.trim().slice(0, MAX_MESSAGE_LENGTH)
                : '';

            if (type === 'text' && !text) return;

            // A snapshot, so the quoted line still reads correctly later even
            // if the original is edited or the list is paged away.
            const replyTo = payload.replyTo && payload.replyTo.messageId
                ? {
                    messageId: String(payload.replyTo.messageId),
                    sender: String(payload.replyTo.sender || ''),
                    text: String(payload.replyTo.text || '').slice(0, 200),
                    type: payload.replyTo.type === 'image' ? 'image' : 'text',
                }
                : null;

            const message = await Message.create({
                sender: me,
                receiver: to,
                text,
                type,
                fileUrl: payload.fileUrl || null,
                conversationKey: conversationKeyFor(me, to),
                replyTo,
                reactions: [],
            });

            const wire = {
                _id: String(message._id),
                sender: message.sender,
                receiver: message.receiver,
                text: message.text,
                type: message.type,
                fileUrl: message.fileUrl,
                createdAt: message.createdAt,
                replyTo: message.replyTo || null,
                reactions: [],
                // Echoed back so an optimistically rendered message can be
                // reconciled instead of appearing twice.
                clientId: payload.clientId || null,
            };

            io.to(roomFor(to)).emit(EVENTS.MESSAGE_NEW, wire);
            io.to(roomFor(to)).emit(EVENTS.LEGACY_MESSAGE_RECEIVE, wire);

            // The sender's own tabs, so a second window stays in step.
            io.to(roomFor(me)).emit(EVENTS.MESSAGE_SENT, wire);

            if (typeof ack === 'function') ack({ ok: true, message: wire });
        } catch (error) {
            console.error('Message send error:', error);
            socket.emit(EVENTS.MESSAGE_ERROR, { message: 'Failed to send message.' });
            if (typeof ack === 'function') ack({ ok: false });
        }
    });

    socket.on(EVENTS.REACTION_TOGGLE, async (data, ack) => {
        try {
            const messageId = data && data.messageId;
            const emoji = data && data.emoji;
            if (!messageId || !emoji) return;

            const message = await Message.findById(messageId);
            if (!message) return;

            // Only the two people in the conversation may react to it.
            if (message.sender !== me && message.receiver !== me) return;

            message.reactions = applyReaction(message.reactions, { username: me, emoji });
            await message.save();

            const wire = {
                messageId: String(message._id),
                reactions: message.reactions.map((r) => ({ username: r.username, emoji: r.emoji })),
            };

            io.to(roomFor(message.sender)).emit(EVENTS.REACTION_UPDATED, wire);
            io.to(roomFor(message.receiver)).emit(EVENTS.REACTION_UPDATED, wire);

            if (typeof ack === 'function') ack({ ok: true, reactions: wire.reactions });
        } catch (error) {
            // An emoji outside the offered set lands here; nothing to do but
            // leave the message as it was.
            if (typeof ack === 'function') ack({ ok: false, message: error.message });
        }
    });

    socket.on(EVENTS.MESSAGE_READ, async (data, ack) => {
        try {
            const peer = data && data.peer ? String(data.peer).toLowerCase() : null;
            if (!peer) return;

            const at = await chat.markRead({ me, peer });

            // The sender learns their messages were seen.
            io.to(roomFor(peer)).emit(EVENTS.MESSAGE_READ_ACK, { reader: me, readAt: at });

            // And her other tabs clear their badge too.
            io.to(roomFor(me)).emit(EVENTS.MESSAGE_READ_ACK, { reader: me, peer, readAt: at });

            if (typeof ack === 'function') ack({ ok: true, readAt: at });
        } catch (error) {
            console.error('Read state error:', error);
            if (typeof ack === 'function') ack({ ok: false });
        }
    });
}

module.exports = { registerChatHandlers, MAX_MESSAGE_LENGTH };
