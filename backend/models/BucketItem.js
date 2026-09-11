'use strict';

const mongoose = require('mongoose');

/** Something the two of them mean to do. Either can add or tick one off. */
const bucketItemSchema = new mongoose.Schema({
    text: { type: String, required: true, trim: true },
    done: { type: Boolean, default: false },
    doneAt: { type: Date, default: null },
    doneBy: { type: String, default: null, lowercase: true, trim: true },
    addedBy: { type: String, required: true, lowercase: true, trim: true },
}, { timestamps: true });

module.exports = mongoose.model('BucketItem', bucketItemSchema);
