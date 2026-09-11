'use strict';

/**
 * The realtime protocol, in one place.
 *
 * Event names scattered as string literals across files are how a client and a
 * server quietly stop agreeing. Everything that emits or listens imports from
 * here.
 */
const EVENTS = {
    // Messages
    MESSAGE_SEND: 'message:send',
    MESSAGE_SENT: 'message:sent',
    MESSAGE_NEW: 'message:new',
    MESSAGE_ERROR: 'message:error',

    // Read state
    MESSAGE_READ: 'message:read',
    MESSAGE_READ_ACK: 'message:read:ack',

    // Typing
    TYPING_START: 'typing:start',
    TYPING_STOP: 'typing:stop',

    // Reactions
    REACTION_TOGGLE: 'reaction:toggle',
    REACTION_UPDATED: 'reaction:updated',

    // Presence
    PRESENCE_UPDATE: 'presence:update',

    // Kept so the current vanilla client keeps working until the React chamber
    // replaces it. Both are emitted during the transition.
    LEGACY_MESSAGE_RECEIVE: 'message:receive',
    LEGACY_USERS_ONLINE: 'users:online',
};

/** Everyone signed in as this user, across every tab and device. */
const roomFor = (userId) => `user:${String(userId).toLowerCase()}`;

module.exports = { EVENTS, roomFor };
