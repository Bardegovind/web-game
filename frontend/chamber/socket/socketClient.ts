import { io, type Socket } from 'socket.io-client';
import { EVENTS } from './events';
import type { Message, PresencePayload, ReadReceipt, TypingPayload } from '../types';
import { usePresenceStore } from '../stores/presenceStore';
import { useChatStore } from '../stores/chatStore';

let socket: Socket | null = null;

/** Callers register what they want to happen when messages land. */
export interface SocketCallbacks {
    onMessage?: (message: Message) => void;
    onRead?: (receipt: ReadReceipt) => void;
    onResync?: () => void;
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
        usePresenceStore.getState().setConnection('online');
        // Anything that arrived while the socket was down is re-fetched rather
        // than assumed lost or duplicated.
        callbacks.onResync?.();
    });

    socket.on('disconnect', () => usePresenceStore.getState().setConnection('reconnecting'));
    socket.io.on('reconnect_attempt', () => usePresenceStore.getState().setConnection('reconnecting'));
    socket.on('connect_error', () => usePresenceStore.getState().setConnection('reconnecting'));

    socket.on(EVENTS.PRESENCE_UPDATE, (payload: PresencePayload) => {
        usePresenceStore.getState().setOnline(payload.username, payload.isOnline);
    });

    socket.on(EVENTS.MESSAGE_NEW, (message: Message) => callbacks.onMessage?.(message));

    socket.on(EVENTS.MESSAGE_SENT, (message: Message) => {
        useChatStore.getState().reconcile(message.receiver, message);
    });

    socket.on(EVENTS.MESSAGE_READ_ACK, (receipt: ReadReceipt) => callbacks.onRead?.(receipt));

    socket.on(EVENTS.TYPING_START, (payload: TypingPayload) => {
        usePresenceStore.getState().setTyping(payload.sender, true);
    });

    socket.on(EVENTS.TYPING_STOP, (payload: TypingPayload) => {
        usePresenceStore.getState().setTyping(payload.sender, false);
    });

    return socket;
}

export function disconnectSocket(): void {
    socket?.disconnect();
    socket = null;
    usePresenceStore.getState().setConnection('offline');
}

export function sendMessage(payload: {
    receiver: string;
    text?: string;
    type: 'text' | 'image';
    fileUrl?: string;
    clientId: string;
}): void {
    socket?.emit(EVENTS.MESSAGE_SEND, payload);
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
