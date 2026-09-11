import { create } from 'zustand';
import type { Message, Reaction } from '../types';

interface ChatState {
    activePeer: string | null;
    messagesByPeer: Record<string, Message[]>;
    /** How far each peer has read, so sent messages can show a tick. */
    peerReadAt: Record<string, string>;
    setPeerReadAt: (peer: string, readAt: string) => void;
    setReactions: (messageId: string, reactions: Reaction[]) => void;
    setActivePeer: (peer: string | null) => void;
    setMessages: (peer: string, messages: Message[]) => void;
    addMessage: (peer: string, message: Message) => void;
    /** Replaces an optimistic message with the stored one the server confirmed. */
    reconcile: (peer: string, message: Message) => void;
    markFailed: (peer: string, clientId: string) => void;
}

/** Chronological, and never the same message twice. */
function insert(existing: Message[], message: Message): Message[] {
    const alreadyStored = message._id && existing.some((m) => m._id === message._id);
    if (alreadyStored) return existing;

    return [...existing, message].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
}

export const useChatStore = create<ChatState>((set) => ({
    activePeer: null,
    messagesByPeer: {},
    peerReadAt: {},

    setPeerReadAt: (peer, readAt) =>
        set((state) => ({ peerReadAt: { ...state.peerReadAt, [peer]: readAt } })),

    /** A reaction can land on a message in any open conversation. */
    setReactions: (messageId, reactions) =>
        set((state) => {
            const next: Record<string, Message[]> = {};
            for (const [peer, messages] of Object.entries(state.messagesByPeer)) {
                next[peer] = messages.map((m) => (m._id === messageId ? { ...m, reactions } : m));
            }
            return { messagesByPeer: next };
        }),

    setActivePeer: (activePeer) => set({ activePeer }),

    setMessages: (peer, messages) =>
        set((state) => ({ messagesByPeer: { ...state.messagesByPeer, [peer]: messages } })),

    addMessage: (peer, message) =>
        set((state) => ({
            messagesByPeer: {
                ...state.messagesByPeer,
                [peer]: insert(state.messagesByPeer[peer] ?? [], message),
            },
        })),

    /**
     * The acknowledgement carries back the clientId this client generated, so
     * the message already on screen becomes the stored one rather than a second
     * copy appearing beside it.
     */
    reconcile: (peer, message) =>
        set((state) => {
            const current = state.messagesByPeer[peer] ?? [];
            const optimisticIndex = message.clientId
                ? current.findIndex((m) => m.clientId === message.clientId && m.pending)
                : -1;

            if (optimisticIndex === -1) {
                return {
                    messagesByPeer: { ...state.messagesByPeer, [peer]: insert(current, message) },
                };
            }

            const next = current.slice();
            next[optimisticIndex] = { ...message, pending: false };
            return { messagesByPeer: { ...state.messagesByPeer, [peer]: next } };
        }),

    markFailed: (peer, clientId) =>
        set((state) => ({
            messagesByPeer: {
                ...state.messagesByPeer,
                [peer]: (state.messagesByPeer[peer] ?? []).map((m) =>
                    m.clientId === clientId ? { ...m, pending: false, failed: true } : m
                ),
            },
        })),
}));
