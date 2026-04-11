/**
 * Gallery — handles image upload, display, delete, and lightbox
 */
const gallery = {
    gridEl: null,
    emptyEl: null,
    uploadInput: null,
    progressEl: null,
    progressFill: null,
    lightbox: null,
    lightboxImage: null,
    images: [],

    init() {
        this.gridEl = document.getElementById('gallery-grid');
        this.emptyEl = document.getElementById('gallery-empty');
        this.uploadInput = document.getElementById('gallery-upload');
        this.progressEl = document.getElementById('upload-progress');
        this.progressFill = document.getElementById('progress-fill');
        this.lightbox = document.getElementById('lightbox');
        this.lightboxImage = document.getElementById('lightbox-image');

        // Upload handler
        this.uploadInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.uploadImage(e.target.files[0]);
                e.target.value = ''; // Reset so same file can be uploaded again
            }
        });

        // Lightbox close
        document.getElementById('lightbox-close').addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeLightbox();
        });
        this.lightbox.addEventListener('click', (e) => {
            if (e.target === this.lightbox) this.closeLightbox();
        });

        // Close lightbox on ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.lightbox.style.display !== 'none') {
                this.closeLightbox();
            }
        });
    },

    /**
     * Load all gallery images from backend
     */
    async loadImages() {
        try {
            const result = await api.get('/gallery');
            if (result.success) {
                this.images = result.images;
                this.renderImages();
            }
        } catch (error) {
            console.error('Failed to load gallery:', error);
        }
    },

    /**
     * Render images to the grid
     */
    renderImages() {
        this.gridEl.innerHTML = '';

        if (this.images.length === 0) {
            this.emptyEl.classList.add('show');
            return;
        }

        this.emptyEl.classList.remove('show');

        this.images.forEach((img) => {
            const item = document.createElement('div');
            item.className = 'gallery-item';
            item.innerHTML = `
                <img src="${img.url}" alt="${img.caption || 'Gallery image'}" loading="lazy">
                <div class="gallery-item-overlay">
                    <span class="gallery-item-caption">${img.caption || ''}</span>
                    <button class="gallery-delete-btn" data-id="${img._id}" title="Delete">🗑</button>
                </div>
            `;

            // Click image to open lightbox
            item.querySelector('img').addEventListener('click', () => {
                this.openLightbox(img.url);
            });

            // Delete button
            item.querySelector('.gallery-delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteImage(img._id);
            });

            this.gridEl.appendChild(item);
        });
    },

    /**
     * Upload a single image
     */
    async uploadImage(file) {
        this.progressEl.style.display = 'block';
        this.progressFill.style.width = '30%';

        const formData = new FormData();
        formData.append('image', file);

        try {
            this.progressFill.style.width = '70%';
            const result = await api.upload('/gallery/upload', formData);

            if (result.success) {
                this.progressFill.style.width = '100%';
                // Add new image to the start of the array
                this.images.unshift(result.image);
                this.renderImages();

                setTimeout(() => {
                    this.progressEl.style.display = 'none';
                    this.progressFill.style.width = '0%';
                }, 800);
            } else {
                alert('Upload failed: ' + (result.message || 'Unknown error'));
                this.progressEl.style.display = 'none';
            }
        } catch (error) {
            console.error('Upload error:', error);
            alert('Upload failed. Please try again.');
            this.progressEl.style.display = 'none';
        }
    },

    /**
     * Delete an image
     */
    async deleteImage(id) {
        if (!confirm('Delete this image?')) return;

        try {
            const result = await api.delete(`/gallery/${id}`);
            if (result.success) {
                this.images = this.images.filter(img => img._id !== id);
                this.renderImages();
            } else {
                alert('Delete failed: ' + result.message);
            }
        } catch (error) {
            console.error('Delete error:', error);
        }
    },

    /**
     * Open lightbox with image
     */
    openLightbox(url) {
        this.lightboxImage.src = url;
        this.lightbox.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    },

    /**
     * Close lightbox
     */
    closeLightbox() {
        this.lightbox.style.display = 'none';
        this.lightboxImage.src = '';
        document.body.style.overflow = '';
    },
};

document.addEventListener('DOMContentLoaded', () => {
    gallery.init();
});
