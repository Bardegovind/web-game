const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    sender: {
        type: String,
        required: true,
        trim: true,
    },
    receiver: {
        type: String,
        required: true,
        trim: true,
    },
    text: {
        type: String,
        trim: true,
    },
    type: {
        type: String,
        enum: ['text', 'image'],
        default: 'text',
    },
    fileUrl: String,
}, { timestamps: true });

// Index for fast DM queries between two users
messageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
