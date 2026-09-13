import { create } from 'zustand';
import type { Message, Reaction } from '../types';
import { insertMessage, markMessageFailed, mergeHistory, reconcileMessage } from './mergeMessages';

interface ChatState {
    activePeer: string | null;
    messagesByPeer: Record<string, Message[]>;
    /** How far each peer has read, so sent messages can show a tick. */
    peerReadAt: Record<string, string>;
    setPeerReadAt: (peer: string, readAt: string) => void;
    setReactions: (messageId: string, reactions: Reaction[]) => void;
    setActivePeer: (peer: string | null) => void;
    /** Merges server history in; messages it could not yet include are kept. */
    setMessages: (peer: string, messages: Message[]) => void;
    addMessage: (peer: string, message: Message) => void;
    /** Replaces an optimistic message with the stored one the server confirmed. */
    reconcile: (peer: string, message: Message) => void;
    markFailed: (peer: string, clientId: string) => void;
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

    /**
     * History is a snapshot that may predate what is on screen, so it is
     * merged in: a message sent, failed or heard live since it was fetched
     * stays, and nothing appears twice.
     */
    setMessages: (peer, messages) =>
        set((state) => ({
            messagesByPeer: {
                ...state.messagesByPeer,
                [peer]: mergeHistory(state.messagesByPeer[peer] ?? [], messages),
            },
        })),

    addMessage: (peer, message) =>
        set((state) => ({
            messagesByPeer: {
                ...state.messagesByPeer,
                [peer]: insertMessage(state.messagesByPeer[peer] ?? [], message),
            },
        })),

    /**
     * The acknowledgement carries back the clientId this client generated, so
     * the message already on screen becomes the stored one rather than a second
     * copy appearing beside it.
     */
    reconcile: (peer, message) =>
        set((state) => ({
            messagesByPeer: {
                ...state.messagesByPeer,
                [peer]: reconcileMessage(state.messagesByPeer[peer] ?? [], message),
            },
        })),

    markFailed: (peer, clientId) =>
        set((state) => ({
            messagesByPeer: {
                ...state.messagesByPeer,
                [peer]: markMessageFailed(state.messagesByPeer[peer] ?? [], clientId),
            },
        })),
}));
