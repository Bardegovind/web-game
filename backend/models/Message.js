const mongoose = require('mongoose');

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
