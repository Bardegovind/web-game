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
                    className="fixed inset-0 z-50 flex items-center justify-center bg-ink/95 p-4 backdrop-blur-sm"
                >
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="absolute top-4 right-4 rounded-full p-2 text-dust transition-colors hover:text-chalk"
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
                        className="max-h-full max-w-full rounded-xl object-contain"
                    />
                </motion.div>
            )}
        </AnimatePresence>
    );
}
