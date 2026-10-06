const instagramService = require('../../services/instagram/instagram.service');

exports.connect = (req, res) => {
    try {
        const url = instagramService.getAuthorizationUrl(req);
        res.json({ success: true, url });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.callback = async (req, res) => {
    try {
        const { code, state, error, error_reason, error_description } = req.query;
        
        if (error) {
            return res.redirect(`/?instagram_error=${encodeURIComponent(error_description || error)}`);
        }

        if (!code || !state) {
            return res.status(400).json({ success: false, message: 'Missing code or state' });
        }

        await instagramService.handleCallback(code, state, req);
        
        // Redirect to frontend reels page or dashboard
        res.redirect('/reels?instagram_connected=true');
    } catch (error) {
        console.error('Instagram Callback Error:', error);
        res.redirect('/reels?instagram_error=true');
    }
};

exports.getConnection = async (req, res) => {
    try {
        const connection = await instagramService.getConnection(req.user.username);
        if (!connection) {
            return res.json({ success: true, connected: false });
        }
        res.json({
            success: true,
            connected: true,
            status: connection.status,
            username: connection.instagramUsername,
            lastSyncAt: connection.lastSyncAt
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.disconnect = async (req, res) => {
    try {
        await instagramService.disconnect(req.user.username);
        res.json({ success: true, message: 'Disconnected successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.sync = async (req, res) => {
    try {
        const connection = await instagramService.getConnection(req.user.username);
        if (!connection) return res.status(404).json({ success: false, message: 'Integration not found' });
        
        await instagramService.syncMedia(connection._id);
        res.json({ success: true, message: 'Sync completed' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getReels = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        
        const data = await instagramService.getReels(req.user.username, page, limit);
        res.json({ success: true, data });
    } catch (error) {
        if (error.message === 'Integration not found') {
            return res.status(404).json({ success: false, message: 'Instagram not connected' });
        }
        res.status(500).json({ success: false, message: error.message });
    }
};
