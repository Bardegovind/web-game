import { io, type Socket } from 'socket.io-client';
import { EVENTS } from './events';
import type { Message, PresencePayload, Reaction, ReadReceipt, TypingPayload } from '../types';
import { usePresenceStore } from '../stores/presenceStore';
import { useChatStore } from '../stores/chatStore';

let socket: Socket | null = null;

/** Callers register what they want to happen when messages land. */
export interface SocketCallbacks {
    onMessage?: (message: Message) => void;
    onRead?: (receipt: ReadReceipt) => void;
    onResync?: () => void;
    onPresence?: (update: PresencePayload) => void;
    /** Who the server says is online: sent as each connection opens, and whenever someone comes or goes. */
    onOnlineList?: (usernames: string[]) => void;
    /** A heart sent from the other person, delivered live if she is here to receive it. */
    onNudge?: (payload: { from: string; createdAt: string }) => void;
}

let callbacks: SocketCallbacks = {};

export function setSocketCallbacks(next: SocketCallbacks): void {
    callbacks = next;
}

export function connectSocket(token: string): Socket {
    if (socket) return socket;

    const presence = usePresenceStore.getState();
    presence.setConnection('connecting');

    socket = io({ auth: { token } });

    socket.on('connect', () => {
        const state = usePresenceStore.getState();
        // While the socket was away it may have missed someone leaving,
        // arriving or stopping typing. A new connection starts from what the
        // server says now, not from what the old one heard.
        state.resetLive();
        state.setConnection('online');
        // Anything that arrived while the socket was down is re-fetched rather
        // than assumed lost or duplicated.
        callbacks.onResync?.();
    });

    socket.on('disconnect', () => usePresenceStore.getState().setConnection('reconnecting'));
    socket.io.on('reconnect_attempt', () => usePresenceStore.getState().setConnection('reconnecting'));
    socket.on('connect_error', () => usePresenceStore.getState().setConnection('reconnecting'));

    socket.on(EVENTS.PRESENCE_UPDATE, (payload: PresencePayload) => {
        usePresenceStore.getState().setOnline(payload.username, payload.isOnline);
        callbacks.onPresence?.(payload);
    });

    socket.on(EVENTS.LEGACY_USERS_ONLINE, (users: Array<{ username: string }>) => {
        const usernames = Array.isArray(users) ? users.map((user) => user.username) : [];
        usePresenceStore.getState().setListedOnline(usernames);
        callbacks.onOnlineList?.(usernames);
    });

    socket.on(EVENTS.MESSAGE_NEW, (message: Message) => callbacks.onMessage?.(message));

    socket.on(EVENTS.MESSAGE_SENT, (message: Message) => {
        useChatStore.getState().reconcile(message.receiver, message);
    });

    socket.on(EVENTS.MESSAGE_READ_ACK, (receipt: ReadReceipt) => {
        // When the other person reads, their tick moves forward.
        if (receipt.reader && !receipt.peer) {
            useChatStore.getState().setPeerReadAt(receipt.reader, receipt.readAt);
        }
        callbacks.onRead?.(receipt);
    });

    socket.on(EVENTS.REACTION_UPDATED, (payload: { messageId: string; reactions: Reaction[] }) => {
        useChatStore.getState().setReactions(payload.messageId, payload.reactions);
    });

    socket.on(EVENTS.NUDGE_NEW, (payload: { from: string; createdAt: string }) => callbacks.onNudge?.(payload));

    socket.on(EVENTS.TYPING_START, (payload: TypingPayload) => {
        usePresenceStore.getState().setTyping(payload.sender, true);
    });

    socket.on(EVENTS.TYPING_STOP, (payload: TypingPayload) => {
        usePresenceStore.getState().setTyping(payload.sender, false);
    });

    return socket;
}

/**
 * Every way out of the chamber ends here: the Leave button calls it, and the
 * auto-exit when the page is hidden (`chamber:exit`) unmounts the socket
 * effect, whose cleanup calls it. Nothing heard on this visit carries into the
 * next one.
 */
export function disconnectSocket(): void {
    socket?.disconnect();
    socket = null;
    const state = usePresenceStore.getState();
    state.resetLive();
    state.setConnection('offline');
}

export function sendMessage(payload: {
    receiver: string;
    text?: string;
    type: 'text' | 'image';
    fileUrl?: string;
    clientId: string;
    replyTo?: { messageId: string; sender: string; text: string; type: 'text' | 'image' } | null;
}): void {
    socket?.emit(EVENTS.MESSAGE_SEND, payload);
}

export function toggleReaction(messageId: string, emoji: string): void {
    socket?.emit(EVENTS.REACTION_TOGGLE, { messageId, emoji });
}

export function sendRead(peer: string): void {
    socket?.emit(EVENTS.MESSAGE_READ, { peer });
}

export function sendTyping(receiver: string, isTyping: boolean): void {
    socket?.emit(isTyping ? EVENTS.TYPING_START : EVENTS.TYPING_STOP, { receiver });
}

export function newClientId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `c-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
