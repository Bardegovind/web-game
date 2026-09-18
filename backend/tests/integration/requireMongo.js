'use strict';

const net = require('node:net');

/**
 * Integration tests need a throwaway MongoDB. Without this guard an absent
 * container shows up as a 30-second timeout and an unhelpful failure, which
 * reads like the code is broken when the environment simply is not ready.
 */
function parsePort(uri) {
    const match = /:(\d+)/.exec(uri);
    return match ? Number(match[1]) : 27017;
}

function parseHost(uri) {
    const match = /\/\/([^:/]+)/.exec(uri);
    return match ? match[1] : '127.0.0.1';
}

function isReachable(uri, timeoutMs = 1500) {
    return new Promise((resolve) => {
        const socket = net.createConnection({ host: parseHost(uri), port: parsePort(uri) });
        const done = (result) => {
            socket.destroy();
            resolve(result);
        };
        socket.setTimeout(timeoutMs);
        socket.once('connect', () => done(true));
        socket.once('error', () => done(false));
        socket.once('timeout', () => done(false));
    });
}

const SKIP_MESSAGE =
    'needs a test MongoDB: docker run -d --name wg-test-mongo -p 27018:27017 --ulimit nofile=64000:64000 mongo:7';

module.exports = { isReachable, SKIP_MESSAGE };
