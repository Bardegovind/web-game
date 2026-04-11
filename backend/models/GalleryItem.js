const mongoose = require('mongoose');

const galleryItemSchema = new mongoose.Schema({
    url: {
        type: String,
        required: true,
    },
    publicId: {
        type: String,
        required: true,
    },
    caption: {
        type: String,
        default: '',
        trim: true,
    },
    uploadedBy: {
        type: String,
        default: 'anonymous',
    },
}, { timestamps: true });

module.exports = mongoose.model('GalleryItem', galleryItemSchema);
