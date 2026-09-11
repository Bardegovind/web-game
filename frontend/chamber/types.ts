/**
 * The shapes the chamber and the server agree on.
 *
 * Typed on purpose: a client and a server that quietly stop agreeing about an
 * event payload is the failure this is here to prevent.
 */

export interface User {
    username: string;
    displayName?: string;
}

export interface Message {
    _id: string;
    sender: string;
    receiver: string;
    text: string;
    type: 'text' | 'image';
    fileUrl: string | null;
    createdAt: string;
    /** Present only on a message this client sent, so it can be reconciled. */
    clientId?: string | null;
    /** True while an optimistic message is still awaiting its acknowledgement. */
    pending?: boolean;
    failed?: boolean;
}

export interface Conversation {
    username: string;
    isOnline: boolean;
    lastSeen: string | null;
    unreadCount: number;
    lastMessage: { text: string; sender: string; createdAt: string } | null;
    lastMessageAt: string | null;
}

export interface Memory {
    _id: string;
    url: string;
    publicId: string;
    caption: string;
    uploadedBy: string;
    createdAt: string;
}

export type ConnectionState = 'connecting' | 'online' | 'reconnecting' | 'offline';

export interface PresencePayload {
    username: string;
    isOnline: boolean;
    at: string;
}

export interface TypingPayload {
    sender: string;
}

export interface ReadReceipt {
    reader: string;
    peer?: string;
    readAt: string;
}
