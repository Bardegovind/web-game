'use strict';

const mongoose = require('mongoose');

/**
 * When it started. A single document — there is only one relationship, so
 * there is only ever one row here.
 */
const relationshipSchema = new mongoose.Schema({
    /**
     * Fixed, so the one row is one row. An empty upsert filter let two saves
     * in quick succession — a double tap, a retried request — each decide
     * nothing matched and insert its own copy, after which reads could return
     * either one and the date she just set could appear to revert.
     */
    _id: { type: String, default: 'singleton' },
    startDate: { type: Date, required: true },
    /** Whoever last set or changed it. Not required: the very first row may
     * be created by a fallback rather than a person. */
    updatedBy: { type: String, default: null, lowercase: true, trim: true },
}, { timestamps: true });

module.exports = mongoose.model('Relationship', relationshipSchema);
