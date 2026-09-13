import type { Message } from '../types';

/**
 * How a conversation's list is kept: what the server says, plus what this
 * client knows that the server's answer could not yet include.
 *
 * Pure, so it can be tested without a store or a browser.
 */

function time(message: Message): number {
    return new Date(message.createdAt).getTime();
}

/** Chronological. The sort is stable, so equal times keep their order. */
function ordered(messages: Message[]): Message[] {
    return messages.slice().sort((a, b) => time(a) - time(b));
}

/**
 * A clientId is only unique on the device that made it, so it names a message
 * together with its sender. History carries both people's clientIds.
 */
function clientKey(message: Message): string | null {
    return message.clientId ? JSON.stringify([message.sender, message.clientId]) : null;
}

function sameClientMessage(a: Message, b: Message): boolean {
    const key = clientKey(a);
    return key !== null && key === clientKey(b);
}

/**
 * Every server message is kept (each has its own _id). A local message is
 * dropped when the server, or a local message before it, already has it by
 * _id or by sender and clientId.
 */
function combine(server: Message[], local: Message[]): Message[] {
    const ids = new Set<string>();
    const clientKeys = new Set<string>();
    const result: Message[] = [];

    const keep = (message: Message) => {
        ids.add(message._id);
        const key = clientKey(message);
        if (key) clientKeys.add(key);
        result.push(message);
    };

    for (const message of server) {
        if (!ids.has(message._id)) keep(message);
    }
    for (const message of local) {
        const key = clientKey(message);
        if (ids.has(message._id) || (key && clientKeys.has(key))) continue;
        keep(message);
    }
    return result;
}

/** The stored message, without the flags that only mean something while waiting on the server. */
function confirmed(message: Message): Message {
    const copy = { ...message };
    delete copy.pending;
    delete copy.failed;
    return copy;
}

/** Chronological, and never the same message twice — by its _id, or its sender and clientId. */
export function insertMessage(existing: Message[], message: Message): Message[] {
    const alreadyHere = existing.some(
        (m) => (message._id && m._id === message._id) || sameClientMessage(m, message)
    );
    if (alreadyHere) return existing;
    return ordered([...existing, message]);
}

/**
 * Server history merged into what is already on screen, never replacing it.
 *
 * The snapshot may be older than the local list: it was queried before a
 * message was sent, confirmed or heard live. So the server's copy wins for
 * every message it holds — matched by _id, or by sender and clientId, which
 * history returns — and drops the local copy's pending or failed flag. A
 * local message it does not hold is kept when it is still waiting (pending),
 * failed, or no older than the snapshot's newest message. A confirmed message
 * older than that, which the server no longer returns, is dropped, as a
 * replace would have done.
 */
export function mergeHistory(local: Message[], snapshot: Message[]): Message[] {
    const newest = snapshot.reduce((latest, m) => Math.max(latest, time(m)), -Infinity);
    const notYetInHistory = local.filter(
        (m) => Boolean(m.pending) || Boolean(m.failed) || time(m) >= newest
    );
    return ordered(combine(snapshot, notYetInHistory));
}

/**
 * The server confirmed a message this client sent (the acknowledgement, or
 * the echo to its own room). The local copy with the same sender and clientId
 * becomes the stored message — or, when the stored message is already here
 * because history brought it in, the local copy is removed rather than kept
 * beside it.
 */
export function reconcileMessage(current: Message[], message: Message): Message[] {
    const storedIndex = current.findIndex((m) => m._id === message._id);
    const localIndex = current.findIndex((m, i) => i !== storedIndex && sameClientMessage(m, message));

    if (localIndex === -1) return insertMessage(current, message);
    if (storedIndex !== -1) return current.filter((_, i) => i !== localIndex);

    const next = current.slice();
    next[localIndex] = confirmed(message);
    return ordered(next);
}

export function markMessageFailed(current: Message[], clientId: string): Message[] {
    return current.map((m) => (m.clientId === clientId ? { ...m, pending: false, failed: true } : m));
}
