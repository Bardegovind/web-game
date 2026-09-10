'use strict';

const mongoose = require('mongoose');

/**
 * A person who can enter the chamber.
 *
 * Replaces the single shared MasterPassword: the password now proves *who* you
 * are, not merely that you are allowed in. Seeded from the environment — there
 * is no sign-up, because there are only ever two of them.
 */
const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
    },
    passwordHash: {
        type: String,
        required: true,
    },
    displayName: {
        type: String,
        trim: true,
        default: '',
    },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
