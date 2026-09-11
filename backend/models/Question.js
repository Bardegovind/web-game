'use strict';

const mongoose = require('mongoose');

/**
 * A question for a given day, and what each of them said.
 *
 * Keyed by day rather than by timestamp so both people get the same question,
 * and answering twice replaces rather than appends.
 */
const questionSchema = new mongoose.Schema({
    /** YYYY-MM-DD, so a day has exactly one question. */
    day: { type: String, required: true, unique: true },
    text: { type: String, required: true, trim: true },
    answers: [{
        username: { type: String, required: true, lowercase: true, trim: true },
        text: { type: String, required: true, trim: true },
        answeredAt: { type: Date, default: Date.now },
    }],
}, { timestamps: true });

module.exports = mongoose.model('Question', questionSchema);
