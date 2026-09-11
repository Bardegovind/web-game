/**
 * The realtime protocol. Mirrors backend/socket/events.js exactly.
 *
 * Names live in one place on each side rather than scattered as string
 * literals, because a typo in one file is otherwise invisible until something
 * silently stops arriving.
 */
export const EVENTS = {
    MESSAGE_SEND: 'message:send',
    MESSAGE_SENT: 'message:sent',
    MESSAGE_NEW: 'message:new',
    MESSAGE_ERROR: 'message:error',

    MESSAGE_READ: 'message:read',
    MESSAGE_READ_ACK: 'message:read:ack',

    TYPING_START: 'typing:start',
    TYPING_STOP: 'typing:stop',

    PRESENCE_UPDATE: 'presence:update',
} as const;

export type SocketEvent = (typeof EVENTS)[keyof typeof EVENTS];
