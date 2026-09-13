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

/** The first copy of each message wins; a later one with the same _id or clientId is dropped. */
function withoutDuplicates(messages: Message[]): Message[] {
    const seen = new Set<string>();
    return messages.filter((m) => {
        const keys = [`id:${m._id}`];
        if (m.clientId) keys.push(`client:${m.clientId}`);
        if (keys.some((key) => seen.has(key))) return false;
        keys.forEach((key) => seen.add(key));
        return true;
    });
}

/** The stored message, without the flags that only mean something while waiting on the server. */
function confirmed(message: Message): Message {
    const copy = { ...message };
    delete copy.pending;
    delete copy.failed;
    return copy;
}

/** Chronological, and never the same message twice — by its _id or its clientId. */
export function insertMessage(existing: Message[], message: Message): Message[] {
    const alreadyHere = existing.some(
        (m) => (message._id && m._id === message._id) || (message.clientId && m.clientId === message.clientId)
    );
    if (alreadyHere) return existing;
    return ordered([...existing, message]);
}

/**
 * Server history merged into what is already on screen, never replacing it.
 *
 * The snapshot may be older than the local list: it was queried before a
 * message was sent, confirmed or heard live. So the server's copy wins for
 * every message it holds (matched by _id, or by clientId when it carries one),
 * and a local message it does not hold is kept when it is still waiting
 * (pending), failed, or no older than the snapshot's newest message. A
 * confirmed message older than that, which the server no longer returns, is
 * dropped, as a replace would have done.
 */
export function mergeHistory(local: Message[], snapshot: Message[]): Message[] {
    const serverIds = new Set(snapshot.map((m) => m._id));
    const serverClientIds = new Set(snapshot.map((m) => m.clientId).filter(Boolean));
    const newest = snapshot.reduce((latest, m) => Math.max(latest, time(m)), -Infinity);

    const notYetInHistory = local.filter((m) => {
        if (serverIds.has(m._id)) return false;
        if (m.clientId && serverClientIds.has(m.clientId)) return false;
        return Boolean(m.pending) || Boolean(m.failed) || time(m) >= newest;
    });

    return ordered(withoutDuplicates([...snapshot, ...notYetInHistory]));
}

/**
 * The server confirmed a message this client sent (the acknowledgement, or
 * the echo to its own room). The local copy with the same clientId becomes
 * the stored message — or, when the stored message is already here because
 * history brought it in, the local copy is removed rather than kept beside it.
 */
export function reconcileMessage(current: Message[], message: Message): Message[] {
    const storedIndex = current.findIndex((m) => m._id === message._id);
    const localIndex = message.clientId
        ? current.findIndex((m, i) => i !== storedIndex && m.clientId === message.clientId)
        : -1;

    if (localIndex === -1) return insertMessage(current, message);
    if (storedIndex !== -1) return current.filter((_, i) => i !== localIndex);

    const next = current.slice();
    next[localIndex] = confirmed(message);
    return ordered(next);
}

export function markMessageFailed(current: Message[], clientId: string): Message[] {
    return current.map((m) => (m.clientId === clientId ? { ...m, pending: false, failed: true } : m));
}
