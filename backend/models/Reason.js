'use strict';

const mongoose = require('mongoose');

/**
 * One note in the jar of "why I love you".
 *
 * Kept short on purpose — this is a reason, not an essay — and attributed, so
 * only the person who wrote it can take it back out.
 */
const reasonSchema = new mongoose.Schema({
    text: { type: String, required: true, trim: true, maxlength: 200 },
    author: { type: String, required: true, lowercase: true, trim: true },
}, { timestamps: true });

reasonSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Reason', reasonSchema);
