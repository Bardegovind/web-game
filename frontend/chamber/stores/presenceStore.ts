import { create } from 'zustand';
import type { ConnectionState } from '../types';

interface PresenceState {
    connection: ConnectionState;
    online: Record<string, boolean>;
    typingFrom: Record<string, boolean>;
    setConnection: (state: ConnectionState) => void;
    setOnline: (username: string, isOnline: boolean) => void;
    setTyping: (username: string, isTyping: boolean) => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
    connection: 'connecting',
    online: {},
    typingFrom: {},

    setConnection: (connection) => set({ connection }),

    setOnline: (username, isOnline) =>
        set((state) => ({ online: { ...state.online, [username]: isOnline } })),

    setTyping: (username, isTyping) =>
        set((state) => ({ typingFrom: { ...state.typingFrom, [username]: isTyping } })),
}));
