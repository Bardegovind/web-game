/**
 * One rule for "online", used everywhere it is shown.
 *
 * Freshest first:
 *  1. a live `presence:update` this connection has heard — even a live
 *     `false`, so someone who just left does not keep reading as online
 *     because a stale `true` is still sitting in the conversations list
 *  2. the list of who is online that the server hands each connection as it
 *     opens — anyone not on it is not here
 *  3. the stored value from the conversations API, only until either of
 *     those has arrived
 *
 * The first two belong to the current connection and are cleared whenever it
 * (re)connects or the chamber is left, so nothing heard on an earlier visit
 * or connection can outrank fresher data.
 */
export interface SocketPresence {
    online: Record<string, boolean>;
    listedOnline: readonly string[] | null;
}

export function isPeerOnline(peer: string, socket: SocketPresence, stored: boolean | undefined): boolean {
    const live = socket.online[peer];
    if (live !== undefined) return live;
    if (socket.listedOnline) return socket.listedOnline.includes(peer);
    return stored ?? false;
}
