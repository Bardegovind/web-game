'use strict';

const mongoose = require('mongoose');

/**
 * "Thinking of you" — one tap, sent to the other person.
 *
 * `seenAt` stays null until they notice it, whether that happens live over a
 * socket or later on Today.
 */
const nudgeSchema = new mongoose.Schema({
    from: { type: String, required: true, lowercase: true, trim: true },
    to: { type: String, required: true, lowercase: true, trim: true },
    seenAt: { type: Date, default: null },
}, { timestamps: true });

// Serves both "what is waiting for me" and "when did I last send one".
nudgeSchema.index({ to: 1, seenAt: 1, createdAt: -1 });
nudgeSchema.index({ from: 1, createdAt: -1 });

module.exports = mongoose.model('Nudge', nudgeSchema);
