const InstagramIntegration = require('../../models/InstagramIntegration');
const InstagramMedia = require('../../models/InstagramMedia');
const instagramApi = require('./instagram-api.client');
const { encrypt, decrypt } = require('../../crypto/encryption.service');

class InstagramService {
    
    getRedirectUri(req) {
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        return `${protocol}://${req.get('host')}/api/integrations/instagram/callback`;
    }

    getAuthorizationUrl(req) {
        const redirectUri = this.getRedirectUri(req);
        const clientId = process.env.INSTAGRAM_CLIENT_ID;
        const state = req.user.username; // simplified state mapping to user
        const scopes = 'instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish'; 
        // Note: use standard scopes based on the app configuration
        const scope = 'user_profile,user_media'; 
        
        return `https://api.instagram.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code&state=${state}`;
    }

    async handleCallback(code, state, req) {
        const redirectUri = this.getRedirectUri(req);
        const tokenData = await instagramApi.getAccessToken(code, redirectUri);
        
        const accountInfo = await instagramApi.getAccountInfo(tokenData.accessToken);

        const expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + (tokenData.expiresIn || 60 * 24 * 60 * 60));

        let integration = await InstagramIntegration.findOne({ userId: state });

        if (!integration) {
            integration = new InstagramIntegration({
                userId: state,
                instagramUserId: accountInfo.id,
            });
        }

        integration.instagramUsername = accountInfo.username;
        integration.accessTokenEncrypted = encrypt(tokenData.accessToken);
        integration.tokenExpiresAt = expiresAt;
        integration.status = 'CONNECTED';
        
        await integration.save();
        
        // Initial async sync
        this.syncMedia(integration._id).catch(err => console.error('Initial sync failed:', err));

        return integration;
    }

    async getConnection(userId) {
        return await InstagramIntegration.findOne({ userId });
    }

    async disconnect(userId) {
        return await InstagramIntegration.findOneAndDelete({ userId });
    }

    async syncMedia(integrationId) {
        const integration = await InstagramIntegration.findById(integrationId);
        if (!integration || integration.status !== 'CONNECTED') return;

        const accessToken = decrypt(integration.accessTokenEncrypted);
        if (!accessToken) {
            integration.status = 'ERROR';
            await integration.save();
            throw new Error('Failed to decrypt token');
        }

        try {
            const mediaData = await instagramApi.getMedia(accessToken, 50);
            const items = mediaData.data || [];

            for (const item of items) {
                // Determine if it's a video/reel
                const isReel = item.media_type === 'VIDEO';
                
                await InstagramMedia.findOneAndUpdate(
                    { instagramMediaId: item.id },
                    {
                        integrationId: integration._id,
                        mediaType: item.media_type,
                        caption: item.caption,
                        mediaUrl: item.media_url,
                        thumbnailUrl: item.thumbnail_url,
                        permalink: item.permalink,
                        timestamp: item.timestamp,
                        isReel: isReel,
                        rawMetadata: item
                    },
                    { upsert: true, new: true }
                );
            }

            integration.lastSyncAt = new Date();
            await integration.save();
        } catch (error) {
            console.error('Sync error:', error);
            if (error.response && error.response.status === 401) {
                integration.status = 'REAUTH_REQUIRED';
                await integration.save();
            }
            throw error;
        }
    }

    async getReels(userId, page = 1, limit = 10) {
        const integration = await InstagramIntegration.findOne({ userId });
        if (!integration) throw new Error('Integration not found');

        const skip = (page - 1) * limit;
        
        const reels = await InstagramMedia.find({ 
            integrationId: integration._id,
            isReel: true 
        })
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit);

        return {
            items: reels.map(r => ({
                id: r._id,
                instagram_media_id: r.instagramMediaId,
                type: 'REELS',
                caption: r.caption,
                media_url: r.mediaUrl,
                thumbnail_url: r.thumbnailUrl,
                timestamp: r.timestamp
            })),
            next_cursor: reels.length === limit ? page + 1 : null
        };
    }
}

module.exports = new InstagramService();
