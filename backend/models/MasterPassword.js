const mongoose = require('mongoose');

const masterPasswordSchema = new mongoose.Schema({
    passwordHash: {
        type: String,
        required: true,
    },
}, { timestamps: true });

// Only one document will ever exist in this collection
module.exports = mongoose.model('MasterPassword', masterPasswordSchema);
