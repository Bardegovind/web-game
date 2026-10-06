const mongoose = require('mongoose');

const instagramIntegrationSchema = new mongoose.Schema({
    userId: {
        type: String, // from req.user.username or req.user.sub
        required: true,
        index: true,
    },
    instagramUserId: {
        type: String,
        required: true,
    },
    instagramUsername: String,
    accessTokenEncrypted: {
        type: String,
        required: true,
    },
    tokenExpiresAt: Date,
    scopes: [String],
    status: {
        type: String,
        enum: ['CONNECTED', 'REAUTH_REQUIRED', 'DISCONNECTED', 'ERROR'],
        default: 'CONNECTED'
    },
    lastSyncAt: Date
}, { timestamps: true });

module.exports = mongoose.model('InstagramIntegration', instagramIntegrationSchema);
