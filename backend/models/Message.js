const mongoose = require('mongoose');

/**
 * What a reply quotes. A sub-schema rather than an inline object, because
 * `type` is a reserved key in a Mongoose path definition and a field actually
 * named `type` cannot be declared inline alongside it.
 */
const replySnapshotSchema = new mongoose.Schema({
    messageId: String,
    sender: String,
    text: String,
    type: { type: String, enum: ['text', 'image'], default: 'text' },
}, { _id: false });

const messageSchema = new mongoose.Schema({
    sender: {
        type: String,
        required: true,
        trim: true,
    },
    receiver: {
        type: String,
        required: true,
        trim: true,
    },
    text: {
        type: String,
        trim: true,
    },
    type: {
        type: String,
        enum: ['text', 'image'],
        default: 'text',
    },
    fileUrl: String,
    reactions: [{
        username: { type: String, required: true, lowercase: true, trim: true },
        emoji: { type: String, required: true },
        _id: false,
    }],
    /**
     * A snapshot of what is being replied to, rather than a live reference.
     * The quoted line should still read correctly later, and it saves a lookup
     * on every message rendered.
     */
    replyTo: { type: replySnapshotSchema, default: null },
    /**
     * The id the sender's device gave this message before it was stored.
     * History returns it, so the copy already on the sender's screen can be
     * matched to the stored one even when the acknowledgement was lost.
     * Absent on messages written before this field existed.
     */
    clientId: String,
    /**
     * The two participants, lowercased and sorted. Lets one indexed equality
     * match replace an $or across both directions, which an index can only
     * half-serve. Backfilled for messages written before this field existed.
     */
    conversationKey: {
        type: String,
        index: true,
    },
}, { timestamps: true });

// Serves the history query directly: newest-first within one conversation.
messageSchema.index({ conversationKey: 1, createdAt: -1 });

// Kept from before the conversation key existed. Harmless, and still the index
// behind any query that filters on sender alone.
messageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
