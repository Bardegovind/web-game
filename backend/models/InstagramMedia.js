const mongoose = require('mongoose');

const instagramMediaSchema = new mongoose.Schema({
    integrationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'InstagramIntegration',
        required: true,
        index: true,
    },
    instagramMediaId: {
        type: String,
        required: true,
        unique: true,
    },
    mediaType: String,
    caption: String,
    mediaUrl: String,
    thumbnailUrl: String,
    permalink: String,
    timestamp: Date,
    isReel: {
        type: Boolean,
        default: false
    },
    rawMetadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

module.exports = mongoose.model('InstagramMedia', instagramMediaSchema);
