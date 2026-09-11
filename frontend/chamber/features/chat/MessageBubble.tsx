import { motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import type { Message } from '../../types';
import { formatTime } from '../../utils/time';

/**
 * One message.
 *
 * React escapes text content by default, so nothing here can become markup —
 * the image url is a property, never interpolated into an attribute string.
 */
export function MessageBubble({
    message,
    isMine,
    onOpenImage,
}: {
    message: Message;
    isMine: boolean;
    onOpenImage: (url: string) => void;
}) {
    const isImage = message.type === 'image' && message.fileUrl;

    return (
        <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className={`flex w-full ${isMine ? 'justify-end' : 'justify-start'}`}
        >
            <div
                className={[
                    'max-w-[78%] px-3.5 py-2.5 sm:max-w-[62%]',
                    'rounded-[var(--radius-bubble)]',
                    isMine
                        ? 'bg-lamp text-ink rounded-br-sm'
                        : 'bg-velvet-lifted text-chalk rounded-bl-sm',
                    message.pending ? 'opacity-60' : '',
                    isImage ? 'p-1.5' : '',
                ].join(' ')}
            >
                {isImage ? (
                    <button
                        type="button"
                        onClick={() => onOpenImage(message.fileUrl as string)}
                        className="block overflow-hidden rounded-xl"
                    >
                        <img
                            src={message.fileUrl as string}
                            alt="Shared photo"
                            loading="lazy"
                            className="max-h-72 w-full object-cover"
                        />
                    </button>
                ) : (
                    <p className="text-[0.95rem] leading-relaxed whitespace-pre-wrap break-words">
                        {message.text}
                    </p>
                )}

                <div
                    className={`mt-1 flex items-center gap-1.5 text-[0.66rem] ${
                        isMine ? 'justify-end text-ink/55' : 'text-dust'
                    } ${isImage ? 'px-2 pb-1' : ''}`}
                >
                    {message.failed && <AlertCircle size={11} aria-hidden="true" />}
                    <span>{message.failed ? 'Not sent' : formatTime(message.createdAt)}</span>
                </div>
            </div>
        </motion.div>
    );
}
