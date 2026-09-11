import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

/**
 * One page, two worlds.
 *
 * The Tic-Tac-Toe game and the tap detector stay vanilla and are served as-is —
 * the entrance ritual is frozen and there is nothing to gain by rewriting it.
 * Only the chamber behind the password is React, mounted into a container on
 * the same page so the chamber never gets a URL of its own to be discovered at.
 */
export default defineConfig({
    plugins: [react(), tailwindcss()],
    // The game's own scripts and stylesheet are copied through untouched — they
    // are not part of the React bundle and are not meant to be.
    publicDir: resolve(here, 'public'),
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: resolve(here, 'index.html'),
        },
    },
    server: {
        proxy: {
            '/api': 'http://localhost:5000',
            '/socket.io': { target: 'http://localhost:5000', ws: true },
        },
    },
});
