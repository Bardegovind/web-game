import React, { useRef, useEffect } from 'react';
import { InstagramReel } from '../../types/instagram';

interface ReelCardProps {
    reel: InstagramReel;
    isActive: boolean;
}

export const ReelCard: React.FC<ReelCardProps> = ({ reel, isActive }) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (isActive) {
            videoRef.current?.play().catch(e => console.error("Autoplay prevented:", e));
        } else {
            videoRef.current?.pause();
        }
    }, [isActive]);

    return (
        <div className="w-full h-full flex justify-center items-center bg-black snap-start shrink-0">
            <div className="relative h-full max-w-sm w-full bg-zinc-900 overflow-hidden">
                <video
                    ref={videoRef}
                    src={reel.media_url}
                    poster={reel.thumbnail_url}
                    loop
                    playsInline
                    className="w-full h-full object-cover"
                />
                
                {/* Overlay UI */}
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent text-white">
                    <p className="text-sm line-clamp-2">{reel.caption}</p>
                </div>
            </div>
        </div>
    );
};
