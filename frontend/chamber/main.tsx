import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { App } from './app/App';
import { useAuthStore } from './stores/authStore';
import './index.css';

/**
 * The chamber mounts into the game's page rather than living at a url of its
 * own — there is no address to stumble onto, and the entrance ritual stays
 * exactly where it has always been.
 *
 * The vanilla side hands over by dispatching `chamber:enter` once the password
 * has been accepted, and `chamber:exit` on the way out.
 */
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 2,
            // A failed request should not leave a blank panel — a stale answer
            // is better than nothing while the retry happens.
            refetchOnReconnect: true,
        },
    },
});

interface EnterDetail {
    username: string;
    token: string;
}

/**
 * Installed, the app is the game — same name, same icon. An entry called "Our
 * Place" with a heart on it would hand the secret to anyone glancing at her
 * home screen, which is the one thing this is built to avoid.
 */
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {
            // Working offline is a convenience, not a requirement. If it cannot
            // register — an insecure origin, a private window — everything else
            // carries on unchanged.
        });
    });
}

const container = document.getElementById('chamber-root');

if (container) {
    createRoot(container).render(
        <StrictMode>
            <QueryClientProvider client={queryClient}>
                <App />
            </QueryClientProvider>
        </StrictMode>
    );

    useAuthStore.getState().restore();

    window.addEventListener('chamber:enter', (event) => {
        const detail = (event as CustomEvent<EnterDetail>).detail;
        if (!detail?.token || !detail?.username) return;
        useAuthStore.getState().enter(detail.username, detail.token);
    });

    window.addEventListener('chamber:exit', () => {
        useAuthStore.getState().leave();
    });
}
