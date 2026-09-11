'use strict';

const mongoose = require('mongoose');

/**
 * Where to reach someone when they are not looking at the page.
 *
 * One row per device, because she may have a phone and a laptop. The endpoint
 * is the natural key — the browser reissues the same one for the same device.
 */
const pushSubscriptionSchema = new mongoose.Schema({
    username: { type: String, required: true, lowercase: true, trim: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
        p256dh: { type: String, required: true },
        auth: { type: String, required: true },
    },
}, { timestamps: true });

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
