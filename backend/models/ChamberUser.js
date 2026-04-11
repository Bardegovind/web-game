const mongoose = require('mongoose');

const chamberUserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
    },
    isOnline: {
        type: Boolean,
        default: false,
    },
    lastSeen: {
        type: Date,
        default: Date.now,
    },
    socketId: {
        type: String,
        default: null,
    },
}, { timestamps: true });

module.exports = mongoose.model('ChamberUser', chamberUserSchema);
