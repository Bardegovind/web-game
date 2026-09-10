'use strict';

const mongoose = require('mongoose');

/**
 * How far through a conversation someone has read.
 *
 * A timestamp rather than a counter, deliberately. The unread count is derived
 * from it on demand, so it cannot drift, and it survives a refresh, a logout, a
 * dropped socket or a phone going to sleep — none of which an in-memory tally
 * in the browser could do.
 */
const userConversationSchema = new mongoose.Schema({
    userId: { type: String, required: true, lowercase: true, trim: true },
    peerId: { type: String, required: true, lowercase: true, trim: true },
    lastReadAt: { type: Date, default: () => new Date(0) },
}, { timestamps: true });

userConversationSchema.index({ userId: 1, peerId: 1 }, { unique: true });

module.exports = mongoose.model('UserConversation', userConversationSchema);
