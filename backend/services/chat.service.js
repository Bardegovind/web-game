'use strict';

const DEFAULT_LIMIT = 200;

/**
 * A stable id for the conversation between two people.
 *
 * Sorted, so it does not matter who is asking. One indexed equality match
 * replaces an $or across both directions, which is what lets a single index
 * serve the query instead of half-serving it.
 */
function conversationKeyFor(a, b) {
    return [String(a).toLowerCase(), String(b).toLowerCase()].sort().join('|');
}

function createChatService(deps) {
    const { Message, UserConversation } = deps;

    /**
     * The most recent slice of a conversation, returned oldest-first so it
     * renders top to bottom.
     *
     * Sorting descending and reversing is the whole point: sorting ascending
     * and taking 200 returns the first 200 messages ever sent, so a conversation
     * past that length silently stops showing anything new.
     */
    async function history(params) {
        const { me, peer, before } = params;
        const limit = params.limit || DEFAULT_LIMIT;

        const query = { conversationKey: conversationKeyFor(me, peer) };
        if (before) {
            query.createdAt = { $lt: before };
        }

        const newestFirst = await Message.find(query)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

        return newestFirst.reverse();
    }

    /** Messages from this peer that arrived after she last looked. */
    async function unreadCount(params) {
        const { me, peer } = params;
        const lastReadAt = await lastRead({ me, peer });

        return Message.countDocuments({
            conversationKey: conversationKeyFor(me, peer),
            sender: String(peer).toLowerCase(),
            createdAt: { $gt: lastReadAt },
        });
    }

    async function lastRead(params) {
        const { me, peer } = params;

        const record = await UserConversation.findOne({
            userId: String(me).toLowerCase(),
            peerId: String(peer).toLowerCase(),
        }).lean();

        // Never opened: everything counts as unread.
        return record ? record.lastReadAt : new Date(0);
    }

    /**
     * Records that she has seen this conversation up to `at`.
     *
     * Stored as a timestamp rather than a counter so the state survives a
     * refresh, a logout, a dropped socket or a phone going to sleep — the count
     * is always derived from it, never accumulated.
     */
    async function markRead(params) {
        const { me, peer } = params;
        const at = params.at || new Date();

        await UserConversation.findOneAndUpdate(
            { userId: String(me).toLowerCase(), peerId: String(peer).toLowerCase() },
            { $set: { lastReadAt: at } },
            { upsert: true }
        );

        return at;
    }

    return { history, unreadCount, markRead, lastRead };
}

module.exports = { createChatService, conversationKeyFor };
