'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createPresenceService } = require('../services/presence.service');
const { roomFor } = require('../socket/events');

/** Stands in for Socket.IO's room membership. */
function fakeIo(rooms) {
    return {
        emitted: [],
        in(room) {
            return { fetchSockets: async () => (rooms[room] || []) };
        },
        to(room) {
            const self = this;
            return { emit: (event, payload) => self.emitted.push({ room, event, payload }) };
        },
        emit(event, payload) { this.emitted.push({ room: null, event, payload }); },
    };
}

function fakeChamberUser() {
    const rows = [];
    return {
        rows,
        async findOneAndUpdate(query, update, opts) {
            let row = rows.find((r) => r.username === query.username);
            if (!row) {
                if (!opts || !opts.upsert) return null;
                row = { username: query.username };
                rows.push(row);
            }
            Object.assign(row, update.$set || update);
            return row;
        },
        find() {
            return { lean: async () => rows.filter((r) => r.isOnline) };
        },
    };
}

test('a user with one open tab is online', async () => {
    const io = fakeIo({ [roomFor('her')]: [{ id: 's1' }] });
    const presence = createPresenceService({ io, ChamberUser: fakeChamberUser() });

    assert.equal(await presence.isOnline('her'), true);
});

test('a user with no open tabs is offline', async () => {
    const io = fakeIo({});
    const presence = createPresenceService({ io, ChamberUser: fakeChamberUser() });

    assert.equal(await presence.isOnline('her'), false);
});

/**
 * The multi-tab bug. The old code stored one socketId on the user document, so
 * a second tab overwrote the first and closing either one marked the whole
 * person offline while they were still sitting there.
 */
test('closing one of two tabs leaves the user online', async () => {
    const rooms = { [roomFor('her')]: [{ id: 's1' }, { id: 's2' }] };
    const io = fakeIo(rooms);
    const ChamberUser = fakeChamberUser();
    const presence = createPresenceService({ io, ChamberUser });

    await presence.connected('her');
    assert.equal(await presence.isOnline('her'), true);

    // One tab closes; Socket.IO has already removed it from the room.
    rooms[roomFor('her')] = [{ id: 's2' }];
    await presence.disconnected('her');

    assert.equal(await presence.isOnline('her'), true, 'the surviving tab keeps her online');
    const row = ChamberUser.rows.find((r) => r.username === 'her');
    assert.equal(row.isOnline, true, 'and the stored state must agree');
});

test('closing the last tab marks the user offline and stamps lastSeen', async () => {
    const rooms = { [roomFor('her')]: [{ id: 's1' }] };
    const io = fakeIo(rooms);
    const ChamberUser = fakeChamberUser();
    const presence = createPresenceService({ io, ChamberUser });

    await presence.connected('her');
    rooms[roomFor('her')] = [];
    await presence.disconnected('her');

    const row = ChamberUser.rows.find((r) => r.username === 'her');
    assert.equal(row.isOnline, false);
    assert.ok(row.lastSeen instanceof Date, 'lastSeen should be recorded when they actually leave');
});

test('presence changes are broadcast', async () => {
    const io = fakeIo({ [roomFor('her')]: [{ id: 's1' }] });
    const presence = createPresenceService({ io, ChamberUser: fakeChamberUser() });

    await presence.connected('her');

    const update = io.emitted.find((e) => e.event === 'presence:update');
    assert.ok(update, 'other people need to be told');
    assert.equal(update.payload.username, 'her');
    assert.equal(update.payload.isOnline, true);
});
