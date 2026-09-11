'use strict';

/**
 * Optional Socket.IO Redis adapter.
 *
 * Only needed once more than one backend instance is running: with a single
 * process the in-memory adapter is correct and adds no dependency to run
 * locally. Everything else in the socket layer already talks in rooms, so
 * enabling this changes no application code.
 *
 * Set REDIS_URL to turn it on. Absent, or unreachable, the app keeps running
 * on the default adapter rather than failing to start.
 */
async function attachRedisAdapter(io, redisUrl, log) {
    if (!redisUrl) {
        log('📡 Socket.IO using the in-memory adapter (single instance).');
        return { enabled: false, reason: 'no REDIS_URL' };
    }

    try {
        // Required lazily so the package is not needed for local development.
        const { createAdapter } = require('@socket.io/redis-adapter');
        const { createClient } = require('redis');

        const pub = createClient({ url: redisUrl });
        const sub = pub.duplicate();
        await Promise.all([pub.connect(), sub.connect()]);

        io.adapter(createAdapter(pub, sub));
        log('📡 Socket.IO using the Redis adapter.');
        return { enabled: true };
    } catch (error) {
        // A missing optional dependency or an unreachable Redis must not stop
        // the chamber from opening.
        log(`📡 Redis adapter unavailable (${error.message}); using the in-memory adapter.`);
        return { enabled: false, reason: error.message };
    }
}

module.exports = { attachRedisAdapter };
