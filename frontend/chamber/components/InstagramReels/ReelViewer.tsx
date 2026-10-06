import React, { useState, useEffect, useRef } from 'react';
import { ReelCard } from './ReelCard';
import { InstagramReel } from '../../types/instagram';
import { getReels } from '../../services/instagram-api';

export const ReelViewer: React.FC = () => {
    const [reels, setReels] = useState<InstagramReel[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const containerRef = useRef<HTMLDivElement>(null);

    const loadReels = async (pageNum: number) => {
        try {
            setLoading(true);
            const data = await getReels(pageNum, 10);
            if (data.items.length > 0) {
                setReels(prev => pageNum === 1 ? data.items : [...prev, ...data.items]);
                setHasMore(!!data.next_cursor);
            } else {
                setHasMore(false);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadReels(1);
    }, []);

    const handleScroll = () => {
        if (!containerRef.current) return;
        const { scrollTop, clientHeight } = containerRef.current;
        const index = Math.round(scrollTop / clientHeight);
        
        if (index !== currentIndex) {
            setCurrentIndex(index);
            
            // Load more when nearing the end
            if (index >= reels.length - 3 && hasMore && !loading) {
                setPage(p => {
                    const nextPage = p + 1;
                    loadReels(nextPage);
                    return nextPage;
                });
            }
        }
    };

    if (error) {
        return <div className="text-red-500 p-4">{error}</div>;
    }

    if (loading && reels.length === 0) {
        return <div className="p-4 text-white">Loading Reels...</div>;
    }

    if (reels.length === 0) {
        return <div className="p-4 text-white">No Reels found.</div>;
    }

    return (
        <div 
            ref={containerRef}
            className="w-full h-full overflow-y-scroll snap-y snap-mandatory bg-black flex flex-col no-scrollbar"
            onScroll={handleScroll}
            style={{ height: '100vh', scrollBehavior: 'smooth' }}
        >
            {reels.map((reel, index) => (
                <ReelCard 
                    key={reel.id} 
                    reel={reel} 
                    isActive={index === currentIndex} 
                />
            ))}
            
            {loading && hasMore && (
                <div className="p-4 text-center text-white snap-start shrink-0 h-full flex items-center justify-center">
                    Loading more...
                </div>
            )}
        </div>
    );
};
