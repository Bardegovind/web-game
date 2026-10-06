import React, { useEffect, useState } from 'react';
import { getInstagramConnection, connectInstagram, disconnectInstagram } from '../../services/instagram-api';
import { ReelViewer } from '../../components/InstagramReels/ReelViewer';
import { InstagramConnection } from '../../types/instagram';

export const InstagramReelsPage: React.FC = () => {
    const [connection, setConnection] = useState<InstagramConnection | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        checkConnection();
    }, []);

    const checkConnection = async () => {
        try {
            const data = await getInstagramConnection();
            setConnection(data);
        } catch (error) {
            console.error('Failed to fetch Instagram connection:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleConnect = async () => {
        try {
            await connectInstagram();
        } catch (error) {
            console.error(error);
            alert('Failed to connect to Instagram');
        }
    };

    const handleDisconnect = async () => {
        try {
            await disconnectInstagram();
            await checkConnection();
        } catch (error) {
            console.error(error);
        }
    };

    if (loading) return <div className="p-8 text-white">Loading...</div>;

    if (!connection?.connected) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-zinc-950 text-white">
                <h1 className="text-2xl mb-4">Instagram Reels</h1>
                <p className="text-zinc-400 mb-8">Connect your Instagram Professional account to view your Reels.</p>
                <button 
                    onClick={handleConnect}
                    className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg font-medium hover:opacity-90 transition-opacity"
                >
                    Connect Instagram
                </button>
            </div>
        );
    }

    return (
        <div className="w-full h-screen bg-black flex flex-col">
            <div className="absolute top-0 left-0 right-0 p-4 z-10 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent">
                <div className="text-white font-medium">@{connection.username}</div>
                <button 
                    onClick={handleDisconnect}
                    className="text-xs text-zinc-300 hover:text-white px-3 py-1 bg-white/10 rounded-full"
                >
                    Disconnect
                </button>
            </div>
            
            <div className="flex-1 h-full">
                <ReelViewer />
            </div>
        </div>
    );
};
