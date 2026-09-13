'use strict';

const { EVENTS, roomFor } = require('../socket/events');

/**
 * Who is actually here.
 *
 * Presence is derived from room membership rather than from a socketId stored
 * on the user document. That single scalar was the multi-tab bug: a second tab
 * overwrote the first, and closing either one marked the person offline while
 * they were still sitting there.
 *
 * Asking the adapter how many sockets are in `user:<id>` also keeps working
 * unchanged once the Redis adapter is added, because the adapter answers across
 * every server instance.
 */
function createPresenceService(deps) {
    const { io, ChamberUser } = deps;

    async function socketCount(userId) {
        const sockets = await io.in(roomFor(userId)).fetchSockets();
        return sockets.length;
    }

    async function isOnline(userId) {
        return (await socketCount(userId)) > 0;
    }

    async function setStored(username, isOnlineNow) {
        const update = { isOnline: isOnlineNow };

        // Only stamp lastSeen when they actually leave. Writing it on every
        // event makes "last seen" mean "last did anything", which is not the
        // same thing and reads as wrong.
        if (!isOnlineNow) update.lastSeen = new Date();

        await ChamberUser.findOneAndUpdate(
            { username },
            { $set: update },
            { upsert: true, new: true }
        );
    }

    function broadcast(username, isOnlineNow) {
        io.emit(EVENTS.PRESENCE_UPDATE, {
            username,
            isOnline: isOnlineNow,
            at: new Date().toISOString(),
        });
    }

    /** A tab opened. */
    async function connected(username) {
        await setStored(username, true);
        broadcast(username, true);
    }

    /**
     * A tab closed. Only actually offline once the last one goes — by the time
     * this runs Socket.IO has already removed the socket from the room, so the
     * count reflects what is left.
     */
    async function disconnected(username) {
        const stillHere = await isOnline(username);

        await setStored(username, stillHere);
        if (!stillHere) broadcast(username, false);
    }

    async function onlineUsers() {
        return ChamberUser.find({ isOnline: true }, { username: 1, isOnline: 1, lastSeen: 1 }).lean();
    }

    /**
     * Clears stale `isOnline` flags left behind by a process that stopped
     * while someone was connected — a restart, a crash, a deploy, Ctrl+C. None
     * of that ever runs `disconnected`, so without this a stored "online" can
     * outlive every socket that ever set it.
     *
     * Meant to run once at boot, before the first client can connect. Uses the
     * same cluster-aware `isOnline` check as everywhere else, so with the
     * Redis adapter a user connected to another instance is correctly left
     * online. Returns how many were cleared.
     */
    async function reconcileStoredPresence() {
        const stored = await ChamberUser.find({ isOnline: true }, { username: 1 }).lean();

        let cleared = 0;
        for (const { username } of stored) {
            if (await isOnline(username)) continue;
            await setStored(username, false);
            cleared += 1;
        }

        if (cleared > 0) {
            console.log(`Presence: cleared ${cleared} stale online flag${cleared === 1 ? '' : 's'}`);
        }

        return cleared;
    }

    return { isOnline, connected, disconnected, onlineUsers, socketCount, reconcileStoredPresence };
}

module.exports = { createPresenceService };
