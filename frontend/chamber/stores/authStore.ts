import { create } from 'zustand';

interface AuthState {
    username: string | null;
    token: string | null;
    isInside: boolean;
    enter: (username: string, token: string) => void;
    leave: () => void;
    restore: () => void;
}

/**
 * Who is in the chamber.
 *
 * The vanilla entrance writes the token to localStorage before handing over, so
 * this reads from there rather than owning the login flow. The ritual and the
 * password screen stay exactly where they were.
 */
export const useAuthStore = create<AuthState>((set) => ({
    username: null,
    token: null,
    isInside: false,

    enter: (username, token) => {
        localStorage.setItem('chamber_token', token);
        localStorage.setItem('chamber_username', username);
        set({ username, token, isInside: true });
    },

    leave: () => {
        set({ isInside: false });
    },

    restore: () => {
        const token = localStorage.getItem('chamber_token');
        const username = localStorage.getItem('chamber_username');
        if (token && username) set({ token, username });
    },
}));
