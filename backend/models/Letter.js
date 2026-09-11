'use strict';

const mongoose = require('mongoose');

/**
 * An "open when..." letter.
 *
 * Written ahead of time and left waiting. The moment it is first opened is
 * recorded, because part of the point is knowing when she needed it.
 */
const letterSchema = new mongoose.Schema({
    prompt: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    writtenBy: { type: String, required: true, lowercase: true, trim: true },
    /** Who it is for. A letter is not shown to the person who wrote it as unopened. */
    writtenFor: { type: String, required: true, lowercase: true, trim: true },
    openedAt: { type: Date, default: null },
}, { timestamps: true });

letterSchema.index({ writtenFor: 1, createdAt: -1 });

module.exports = mongoose.model('Letter', letterSchema);
