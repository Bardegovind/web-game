'use strict';

const { EVENTS } = require('./events');

/**
 * Joins the user's room and keeps stored presence in step with it.
 *
 * The room is the source of truth for who is here; the database row exists so
 * the answer survives a restart and can be read over HTTP.
 */
async function registerPresenceHandlers(deps) {
    const { socket, presence, typing, roomFor } = deps;
    const me = socket.user.username;

    // The room was already joined synchronously on connection so that nothing
    // addressed to this user can arrive before they are in it.
    socket.join(roomFor(me));
    await presence.connected(me);

    socket.emit(EVENTS.LEGACY_USERS_ONLINE, await presence.onlineUsers());
    socket.broadcast.emit(EVENTS.LEGACY_USERS_ONLINE, await presence.onlineUsers());

    socket.on('disconnect', async () => {
        try {
            // Do not leave a "typing..." hanging over a socket that has gone.
            typing.clearAllFor(me);

            await presence.disconnected(me);
            socket.broadcast.emit(EVENTS.LEGACY_USERS_ONLINE, await presence.onlineUsers());
        } catch (error) {
            console.error('Disconnect handling error:', error);
        }
    });
}

module.exports = { registerPresenceHandlers };
