'use strict';

const { conversationKeyFor } = require('./chat.service');

/**
 * Gives existing messages a conversation key.
 *
 * Idempotent and additive: it only touches documents that lack the field, and
 * only ever writes a value derived from data already in the document. Running
 * it twice is a no-op, and it never deletes or rewrites message content.
 */
async function backfillConversationKeys(deps) {
    const { Message, log, batchSize } = deps;
    const limit = batchSize || 500;

    let updated = 0;

    for (;;) {
        const pending = await Message.find({
            $or: [{ conversationKey: { $exists: false } }, { conversationKey: null }],
        }).limit(limit).lean();

        if (pending.length === 0) break;

        for (const message of pending) {
            await Message.updateOne(
                { _id: message._id },
                { $set: { conversationKey: conversationKeyFor(message.sender, message.receiver) } }
            );
            updated += 1;
        }

        if (pending.length < limit) break;
    }

    if (updated > 0 && log) {
        log(`🔑 Backfilled conversation keys for ${updated} message(s).`);
    }

    return { updated };
}

module.exports = { backfillConversationKeys };
