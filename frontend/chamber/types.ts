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

export interface Reaction {
    username: string;
    emoji: string;
}

/** A snapshot of the quoted message, carried with the reply. */
export interface ReplySnapshot {
    messageId: string;
    sender: string;
    text: string;
    type: 'text' | 'image';
}

export interface Message {
    _id: string;
    sender: string;
    receiver: string;
    text: string;
    type: 'text' | 'image';
    fileUrl: string | null;
    createdAt: string;
    reactions?: Reaction[];
    replyTo?: ReplySnapshot | null;
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

export interface Letter {
    _id: string;
    prompt: string;
    writtenBy: string;
    createdAt: string;
    isOpened: boolean;
    openedAt: string | null;
    /** Present only once it has been opened. */
    body?: string;
}

export interface StoryEntry {
    _id: string;
    happenedAt: string;
    title: string;
    note: string;
    emoji: string;
    place: string;
    imageUrl: string | null;
    addedBy: string;
}

export interface BucketItem {
    _id: string;
    text: string;
    done: boolean;
    doneAt: string | null;
    doneBy: string | null;
    addedBy: string;
}

export interface QuestionAnswer {
    username: string;
    text: string;
    answeredAt: string;
}

export interface DailyQuestion {
    day: string;
    text: string;
    answers: QuestionAnswer[];
}

export interface Today {
    unreadMessages: number;
    unopenedLetters: number;
    question: { text: string; answered: boolean };
    memoryOfTheDay: { _id: string; url: string; caption: string; createdAt: string } | null;
}
