'use strict';

const mongoose = require('mongoose');

/**
 * When it started. A single document — there is only one relationship, so
 * there is only ever one row here.
 */
const relationshipSchema = new mongoose.Schema({
    startDate: { type: Date, required: true },
    /** Whoever last set or changed it. Not required: the very first row may
     * be created by a fallback rather than a person. */
    updatedBy: { type: String, default: null, lowercase: true, trim: true },
}, { timestamps: true });

module.exports = mongoose.model('Relationship', relationshipSchema);
