import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

export function Lightbox({ url, onClose }: { url: string | null; onClose: () => void }) {
    useEffect(() => {
        if (!url) return;

        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = '';
        };
    }, [url, onClose]);

    return (
        <AnimatePresence>
            {url && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={onClose}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Photo"
                    className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(10,6,16,0.9)] p-4 backdrop-blur-md"
                >
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="glass absolute top-4 right-4 rounded-full p-2 text-chalk/80 transition-colors hover:text-chalk"
                    >
                        <X size={22} />
                    </button>
                    <motion.img
                        initial={{ scale: 0.97 }}
                        animate={{ scale: 1 }}
                        transition={{ duration: 0.2 }}
                        src={url}
                        alt=""
                        onClick={(e) => e.stopPropagation()}
                        className="max-h-full max-w-full rounded-[20px] object-contain shadow-[0_0_60px_rgba(255,60,131,0.18)]"
                    />
                </motion.div>
            )}
        </AnimatePresence>
    );
}
