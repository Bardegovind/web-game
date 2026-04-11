const GalleryItem = require('../models/GalleryItem');
const cloudinary = require('../config/cloudinary');

/**
 * GET /api/gallery
 * Get all gallery images (newest first)
 */
const getAllImages = async (req, res) => {
    try {
        const images = await GalleryItem.find().sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: images.length,
            images,
        });
    } catch (error) {
        console.error('Gallery Fetch Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch gallery images.',
        });
    }
};

/**
 * POST /api/gallery/upload
 * Upload an image to Cloudinary and save metadata in MongoDB
 * File is handled by multer middleware before this controller
 */
const uploadImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded.',
            });
        }

        const { caption } = req.body;

        console.log("FILE:", req.file);
        console.log("BODY:", req.body);

        const galleryItem = await GalleryItem.create({
            url: req.file.path, // Cloudinary URL
            publicId: req.file.filename, // Cloudinary public ID
            caption: caption || '',
            uploadedBy: "admin",
        });

        return res.status(201).json({
            success: true,
            message: 'Image uploaded successfully.',
            image: galleryItem,
        });
    } catch (error) {
        console.error('Gallery Upload Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to upload image.',
        });
    }
};

/**
 * DELETE /api/gallery/:id
 * Delete an image from Cloudinary and MongoDB
 */
const deleteImage = async (req, res) => {
    try {
        const { id } = req.params;

        const galleryItem = await GalleryItem.findById(id);

        if (!galleryItem) {
            return res.status(404).json({
                success: false,
                message: 'Image not found.',
            });
        }

        // Delete from Cloudinary
        await cloudinary.uploader.destroy(galleryItem.publicId);

        // Delete from MongoDB
        await GalleryItem.findByIdAndDelete(id);

        return res.status(200).json({
            success: true,
            message: 'Image deleted successfully.',
        });
    } catch (error) {
        console.error('Gallery Delete Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete image.',
        });
    }
};

module.exports = { getAllImages, uploadImage, deleteImage };
