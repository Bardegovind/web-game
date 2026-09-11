'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth.routes');
const galleryRoutes = require('./routes/gallery.routes');
const chatRoutes = require('./routes/chat.routes');
const chamberRoutes = require('./routes/chamber.routes');

const fs = require('fs');

const BUILT = path.join(__dirname, '..', 'frontend', 'dist');
const SOURCE = path.join(__dirname, '..', 'frontend');

/**
 * Serve the built chamber when it exists, and fall back to the source tree
 * otherwise so a fresh clone still runs the game before anyone has built.
 */
const FRONTEND_DIR = fs.existsSync(path.join(BUILT, 'index.html')) ? BUILT : SOURCE;

/**
 * The HTTP layer. Routing and middleware only — no business logic, no
 * bootstrap, no listening. That belongs to server.js.
 */
function createApp(options) {
    const config = options || {};
    const allowedOrigins = config.allowedOrigins || [];

    const app = express();

    // The frontend is served by this same process, so cross-origin access is
    // not needed for normal use and stays off unless configured.
    app.use(cors(allowedOrigins.length > 0
        ? { origin: allowedOrigins, credentials: true }
        : { origin: false }));

    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: true, limit: '1mb' }));

    app.use(express.static(FRONTEND_DIR));

    app.use('/api/auth', authRoutes);
    app.use('/api/gallery', galleryRoutes);
    app.use('/api/chat', chatRoutes);
    app.use('/api/chamber', chamberRoutes);

    app.get('/api/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // An unknown API route is a 404, not the app shell. Without this the SPA
    // fallback returns HTML with a 200 and every client fetch fails on
    // JSON.parse rather than surfacing the real error.
    app.use('/api', (req, res) => {
        res.status(404).json({ success: false, message: 'Not found.' });
    });

    app.get('{*path}', (req, res) => {
        res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
    });

    // Nothing technical ever reaches her screen.
    app.use((error, req, res, next) => {
        console.error('Unhandled error:', error);
        if (res.headersSent) return next(error);
        res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    });

    return app;
}

module.exports = { createApp };
