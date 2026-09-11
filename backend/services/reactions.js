'use strict';

/**
 * The reactions on offer.
 *
 * Deliberately a short row rather than a keyboard: picking one should take no
 * thought, and a fixed set means nothing arbitrary is ever stored or rendered.
 */
const REACTIONS = ['❤️', '😂', '😭', '😘', '🥹', '🔥'];

/**
 * Applies one person's reaction to a message.
 *
 * One feeling per person: tapping the same one again takes it back, and picking
 * a different one replaces theirs rather than adding a second. Returns a new
 * array; the original is left alone.
 */
function applyReaction(existing, { username, emoji }) {
    if (!REACTIONS.includes(emoji)) {
        throw new Error('That is not one of the reactions.');
    }

    const name = String(username).toLowerCase();
    const others = (existing || []).filter((r) => String(r.username).toLowerCase() !== name);
    const theirs = (existing || []).find((r) => String(r.username).toLowerCase() === name);

    // Tapping the one they already chose undoes it.
    if (theirs && theirs.emoji === emoji) return others;

    return [...others, { username: name, emoji }];
}

module.exports = { applyReaction, REACTIONS };
