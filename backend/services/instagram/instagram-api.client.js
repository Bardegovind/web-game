const axios = require('axios');

class InstagramApiClient {
    constructor() {
        this.baseUrl = process.env.INSTAGRAM_API_BASE_URL || 'https://graph.instagram.com/v21.0';
    }

    async getAccessToken(code, redirectUri) {
        // Exchange code for short-lived token
        const response = await axios.post('https://api.instagram.com/oauth/access_token', {
            client_id: process.env.INSTAGRAM_CLIENT_ID,
            client_secret: process.env.INSTAGRAM_CLIENT_SECRET,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
            code: code,
        }, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const { access_token, user_id } = response.data;
        
        // Exchange for long-lived token (Optional but recommended)
        const longLivedResponse = await axios.get(`https://graph.instagram.com/access_token`, {
            params: {
                grant_type: 'ig_exchange_token',
                client_secret: process.env.INSTAGRAM_CLIENT_SECRET,
                access_token: access_token
            }
        });

        return {
            accessToken: longLivedResponse.data.access_token,
            expiresIn: longLivedResponse.data.expires_in,
            userId: user_id
        };
    }

    async getAccountInfo(accessToken) {
        const response = await axios.get(`${this.baseUrl}/me`, {
            params: {
                fields: 'id,username,account_type',
                access_token: accessToken
            }
        });
        return response.data;
    }

    async getMedia(accessToken, limit = 50, after = null) {
        const params = {
            fields: 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,username',
            access_token: accessToken,
            limit: limit
        };
        if (after) {
            params.after = after;
        }

        const response = await axios.get(`${this.baseUrl}/me/media`, { params });
        return response.data;
    }
}

module.exports = new InstagramApiClient();
