'use strict';

const mongoose = require('mongoose');

/** A moment on the timeline: when it was, what it was, and sometimes a photo. */
const storyEntrySchema = new mongoose.Schema({
    happenedAt: { type: Date, required: true },
    title: { type: String, required: true, trim: true },
    note: { type: String, default: '', trim: true },
    emoji: { type: String, default: '', trim: true },
    place: { type: String, default: '', trim: true },
    imageUrl: { type: String, default: null },
    addedBy: { type: String, required: true, lowercase: true, trim: true },
}, { timestamps: true });

storyEntrySchema.index({ happenedAt: 1 });

module.exports = mongoose.model('StoryEntry', storyEntrySchema);
