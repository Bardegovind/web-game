'use strict';

const { EVENTS } = require('./events');

function registerTypingHandlers(deps) {
    const { socket, typing } = deps;
    const me = socket.user.username;

    socket.on(EVENTS.TYPING_START, (data) => {
        if (!data || !data.receiver) return;
        typing.start(me, data.receiver);
    });

    socket.on(EVENTS.TYPING_STOP, (data) => {
        if (!data || !data.receiver) return;
        typing.stop(me, data.receiver);
    });
}

module.exports = { registerTypingHandlers };
