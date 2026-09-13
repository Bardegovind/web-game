import { create } from 'zustand';
import type { ConnectionState } from '../types';

interface PresenceState {
    connection: ConnectionState;
    /**
     * What the current connection has heard live, per person. Like
     * `listedOnline` and `typingFrom`, it belongs to one connection and one
     * visit: `resetLive` clears all three on every (re)connect and on the way
     * out, so nothing an earlier connection heard can outrank fresher data.
     */
    online: Record<string, boolean>;
    /** Everyone the server last listed as online on this connection; null until it has said. */
    listedOnline: string[] | null;
    typingFrom: Record<string, boolean>;
    setConnection: (state: ConnectionState) => void;
    setOnline: (username: string, isOnline: boolean) => void;
    setListedOnline: (usernames: string[]) => void;
    setTyping: (username: string, isTyping: boolean) => void;
    resetLive: () => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
    connection: 'connecting',
    online: {},
    listedOnline: null,
    typingFrom: {},

    setConnection: (connection) => set({ connection }),

    setOnline: (username, isOnline) =>
        set((state) => ({ online: { ...state.online, [username]: isOnline } })),

    setListedOnline: (listedOnline) => set({ listedOnline }),

    setTyping: (username, isTyping) =>
        set((state) => ({ typingFrom: { ...state.typingFrom, [username]: isTyping } })),

    resetLive: () => set({ online: {}, listedOnline: null, typingFrom: {} }),
}));
