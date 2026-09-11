'use strict';

require('dotenv').config();

const http = require('http');
const mongoose = require('mongoose');

const connectDB = require('./config/db');
const { attachRedisAdapter } = require('./config/redisAdapter');

const User = require('./models/User');
const Message = require('./models/Message');
const MasterPassword = require('./models/MasterPassword');

const { createApp } = require('./app');
const { createSocketServer } = require('./socket');
const { seedUsers } = require('./services/seedUsers');
const { seedMasterPassword } = require('./services/seedMasterPassword');
const { backfillConversationKeys } = require('./services/backfillConversationKeys');
const { configureAuth } = require('./controllers/auth.controller');

const PORT = process.env.PORT || 5000;

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

/** Bootstrap only. */
const startServer = async () => {
    await connectDB();

    // Legacy shared password, kept so an unconfigured deploy still works.
    await seedMasterPassword({ MasterPassword, env: process.env, log: console.log });

    // Real accounts, when configured. Reports 'legacy' when they are not.
    const { mode } = await seedUsers({ User, env: process.env, log: console.log });
    configureAuth(mode);

    // Additive, idempotent: gives messages written before the field existed a
    // conversation key derived from their own sender and receiver.
    await backfillConversationKeys({ Message, log: console.log });

    const app = createApp({ allowedOrigins: ALLOWED_ORIGINS });
    const server = http.createServer(app);

    const { io } = createSocketServer({
        httpServer: server,
        allowedOrigins: ALLOWED_ORIGINS,
        jwtSecret: process.env.JWT_SECRET,
    });

    // Only matters with more than one instance; absent REDIS_URL this is a no-op.
    await attachRedisAdapter(io, process.env.REDIS_URL, console.log);

    server.listen(PORT, () => {
        console.log(`\n🚀 Server running on http://localhost:${PORT}`);
        console.log(`📡 Socket.IO ready for connections`);
        console.log(`🎮 Game: http://localhost:${PORT}\n`);
    });

    /**
     * Shut down without dropping anyone mid-sentence.
     *
     * A container is stopped with SIGTERM. Closing the sockets and the HTTP
     * server first lets in-flight writes finish, so a message being saved as
     * the process ends is not lost. The timeout is the backstop for a
     * connection that refuses to close.
     */
    const shutdown = async (signal) => {
        console.log(`\n${signal} received, closing.`);

        const forced = setTimeout(() => {
            console.error('Shutdown took too long; exiting anyway.');
            process.exit(1);
        }, 10000);
        forced.unref();

        try {
            io.close();
            await new Promise((resolve) => server.close(resolve));
            await mongoose.connection.close();
            console.log('Closed cleanly.');
            process.exit(0);
        } catch (error) {
            console.error('Error during shutdown:', error);
            process.exit(1);
        }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
};

startServer();
