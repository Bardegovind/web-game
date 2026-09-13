'use strict';

/**
 * How a conversation's server history and what this client already holds
 * become one list: nothing sent, failed or heard live since the history was
 * fetched is dropped, and nothing appears twice.
 */

const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let insertMessage;
let mergeHistory;
let reconcileMessage;
let markMessageFailed;

before(async () => {
    ({ insertMessage, mergeHistory, reconcileMessage, markMessageFailed } = await import(
        '../../frontend/chamber/stores/mergeMessages.ts'
    ));
});

const at = (second) => new Date(Date.UTC(2026, 8, 13, 12, 0, second)).toISOString();

/** A stored message from her, as history returns it (history carries no clientId). */
function fromHer(id, second, extra = {}) {
    return {
        _id: id,
        sender: 'radhe',
        receiver: 'govind',
        text: `text ${id}`,
        type: 'text',
        fileUrl: null,
        createdAt: at(second),
        reactions: [],
        replyTo: null,
        ...extra,
    };
}

/** A stored message from me, as history returns it. */
function fromMe(id, second, extra = {}) {
    return fromHer(id, second, { sender: 'govind', receiver: 'radhe', ...extra });
}

/** What send() puts on screen before the server has answered. */
function optimistic(clientId, second, text = `text ${clientId}`) {
    return fromMe(clientId, second, { clientId, pending: true, text });
}

/** The acknowledgement for that send: the stored message, with the clientId echoed. */
function ack(id, clientId, second, text = `text ${clientId}`) {
    return fromMe(id, second, { clientId, text });
}

const ids = (list) => list.map((m) => m._id);
const copiesOf = (list, text) => list.filter((m) => m.text === text).length;

test('first load: an empty store becomes exactly the snapshot', () => {
    const snapshot = [fromHer('s1', 1), fromMe('s2', 2), fromHer('s3', 3)];
    assert.deepEqual(mergeHistory([], snapshot), snapshot);
});

test('a pending message survives a snapshot taken before it was sent', () => {
    const local = insertMessage([], optimistic('c1', 10));
    const merged = mergeHistory(local, [fromHer('s1', 1), fromMe('s2', 2)]);

    assert.deepEqual(ids(merged), ['s1', 's2', 'c1']);
    assert.equal(merged[2].pending, true, 'still pending, so the Not sent timer can still find it');
});

test('a confirmed message newer than the snapshot survives (the ack landed first)', () => {
    let local = insertMessage([], optimistic('c1', 10, 'hello'));
    local = reconcileMessage(local, ack('r1', 'c1', 10, 'hello'));

    const merged = mergeHistory(local, [fromHer('s1', 1), fromMe('s2', 2)]);

    assert.deepEqual(ids(merged), ['s1', 's2', 'r1']);
    assert.equal(copiesOf(merged, 'hello'), 1);
    assert.ok(!merged[2].pending && !merged[2].failed);
});

test('a message heard live after the snapshot was fetched survives', () => {
    const local = insertMessage([], fromHer('live', 12, { text: 'are you there?' }));
    const merged = mergeHistory(local, [fromHer('s1', 1), fromMe('s2', 2)]);

    assert.deepEqual(ids(merged), ['s1', 's2', 'live']);
});

test('a failed message survives a snapshot', () => {
    let local = insertMessage([], optimistic('c1', 10, 'did this go?'));
    local = markMessageFailed(local, 'c1');

    const merged = mergeHistory(local, [fromHer('s1', 1), fromHer('s2', 20)]);

    assert.equal(copiesOf(merged, 'did this go?'), 1);
    const failed = merged.find((m) => m.clientId === 'c1');
    assert.equal(failed.failed, true);
    assert.equal(failed.pending, false);
});

test('a snapshot that holds the pending message (matched by clientId) replaces it, with no duplicate', () => {
    const local = insertMessage([], optimistic('c1', 10, 'hello'));
    const serverCopy = ack('r1', 'c1', 11, 'hello');

    const merged = mergeHistory(local, [fromHer('s1', 1), serverCopy]);

    assert.deepEqual(ids(merged), ['s1', 'r1']);
    assert.equal(copiesOf(merged, 'hello'), 1);
    assert.ok(!merged[1].pending && !merged[1].failed);
});

test('a snapshot copy matched by _id wins over the local copy, and drops its flags', () => {
    const local = [fromMe('r1', 10, { clientId: 'c1', failed: true, reactions: [] })];
    const heart = [{ username: 'radhe', emoji: '❤️' }];
    const serverCopy = fromMe('r1', 11, { reactions: heart });

    const merged = mergeHistory(local, [fromHer('s1', 1), serverCopy]);

    assert.deepEqual(ids(merged), ['s1', 'r1']);
    assert.equal(merged[1], serverCopy, "the server's copy, with its createdAt and reactions");
    assert.ok(!merged[1].pending && !merged[1].failed);
});

test('an ack that lands after a merge already brought the server copy leaves exactly one', () => {
    const local = insertMessage([], optimistic('c1', 10, 'hello'));
    // History carries no clientId, so the pending copy is kept beside it for now.
    const merged = mergeHistory(local, [fromHer('s1', 1), fromMe('r1', 11, { text: 'hello' })]);

    const reconciled = reconcileMessage(merged, ack('r1', 'c1', 11, 'hello'));

    assert.deepEqual(ids(reconciled), ['s1', 'r1']);
    assert.equal(copiesOf(reconciled, 'hello'), 1);
    assert.ok(!reconciled[1].pending && !reconciled[1].failed);
});

test('the result is ordered by createdAt, local and server messages interleaved', () => {
    const local = [
        fromHer('s1', 1),
        optimistic('c5', 5),
        fromHer('live', 30),
        fromMe('r20', 20, { clientId: 'c20' }),
    ];
    const merged = mergeHistory(local, [fromHer('s9', 9), fromHer('s1', 1), fromMe('s15', 15)]);

    assert.deepEqual(ids(merged), ['s1', 'c5', 's9', 's15', 'r20', 'live']);
});

test('a confirmed message the snapshot no longer holds and is not newer than it is dropped, as before', () => {
    const local = [fromHer('gone', 3), fromHer('s1', 1)];
    const merged = mergeHistory(local, [fromHer('s1', 1), fromHer('s9', 9)]);

    assert.deepEqual(ids(merged), ['s1', 's9']);
});

test('merging the same snapshot twice changes nothing', () => {
    const local = [optimistic('c1', 10), fromHer('live', 12)];
    const snapshot = [fromHer('s1', 1), fromMe('s2', 2)];

    const once = mergeHistory(local, snapshot);
    assert.deepEqual(mergeHistory(once, snapshot), once);
});

test('the ack replaces the optimistic copy in place', () => {
    const local = insertMessage([fromHer('s1', 1)], optimistic('c1', 10, 'hello'));
    const reconciled = reconcileMessage(local, ack('r1', 'c1', 10, 'hello'));

    assert.deepEqual(ids(reconciled), ['s1', 'r1']);
    assert.ok(!reconciled[1].pending && !reconciled[1].failed);
});

test('an ack that arrives after the message was marked failed replaces it, not adds a second', () => {
    let local = insertMessage([], optimistic('c1', 10, 'late'));
    local = markMessageFailed(local, 'c1');

    const reconciled = reconcileMessage(local, ack('r1', 'c1', 10, 'late'));

    assert.deepEqual(ids(reconciled), ['r1']);
    assert.ok(!reconciled[0].pending && !reconciled[0].failed);
});

test('the same ack twice leaves one copy', () => {
    let local = insertMessage([], optimistic('c1', 10, 'hello'));
    local = reconcileMessage(local, ack('r1', 'c1', 10, 'hello'));
    local = reconcileMessage(local, ack('r1', 'c1', 10, 'hello'));

    assert.deepEqual(ids(local), ['r1']);
});

test('an ack with no local copy (another tab, a photo) is added in order', () => {
    const local = [fromHer('s1', 1), fromHer('s9', 9)];
    const reconciled = reconcileMessage(local, ack('r5', 'c5', 5));

    assert.deepEqual(ids(reconciled), ['s1', 'r5', 's9']);
});

test('a live message already present by _id or clientId is not added twice', () => {
    const local = [fromHer('s1', 1), optimistic('c2', 2)];

    assert.equal(insertMessage(local, fromHer('s1', 1)), local, 'same _id');
    assert.equal(insertMessage(local, fromMe('r2', 2, { clientId: 'c2' })), local, 'same clientId');
    assert.deepEqual(ids(insertMessage(local, fromHer('s3', 3))), ['s1', 'c2', 's3']);
});
