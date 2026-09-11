import { create } from 'zustand';
import type { Message } from '../types';

interface ChatState {
    activePeer: string | null;
    messagesByPeer: Record<string, Message[]>;
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
