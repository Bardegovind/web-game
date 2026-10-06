export interface InstagramReel {
    id: string;
    instagram_media_id: string;
    type: 'REELS' | 'VIDEO';
    caption: string;
    media_url: string;
    thumbnail_url: string;
    timestamp: string;
}

export interface InstagramConnection {
    success: boolean;
    connected: boolean;
    status?: 'CONNECTED' | 'REAUTH_REQUIRED' | 'DISCONNECTED' | 'ERROR';
    username?: string;
    lastSyncAt?: string;
}
