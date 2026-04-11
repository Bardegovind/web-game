/**
 * API Helper — fetch wrapper for backend calls
 */
const API_BASE = window.location.origin + '/api';

const api = {
    /**
     * GET request
     */
    async get(endpoint) {
        const token = localStorage.getItem('chamber_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${API_BASE}${endpoint}`, { headers });
        return res.json();
    },

    /**
     * POST request (JSON body)
     */
    async post(endpoint, body) {
        const token = localStorage.getItem('chamber_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });
        return res.json();
    },

    /**
     * POST request with FormData (for file uploads)
     */
    async upload(endpoint, formData) {
        const token = localStorage.getItem('chamber_token');
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers,
            body: formData, // Don't set Content-Type — browser sets multipart boundary
        });
        return res.json();
    },

    /**
     * DELETE request
     */
    async delete(endpoint) {
        const token = localStorage.getItem('chamber_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${API_BASE}${endpoint}`, {
            method: 'DELETE',
            headers,
        });
        return res.json();
    },
};
