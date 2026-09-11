import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, Check, CheckCheck, CornerUpLeft, Smile } from 'lucide-react';

import type { Message } from '../../types';
import { formatTime } from '../../utils/time';
import { toggleReaction } from '../../socket/socketClient';

/** The same short row the server accepts. Anything else is refused there. */
const REACTIONS = ['❤️', '😂', '😭', '😘', '🥹', '🔥'];

/**
 * One message.
 *
 * React escapes text content, so nothing here can become markup — the image url
 * is a property, never interpolated into an attribute string.
 */
export function MessageBubble({
    message,
    isMine,
    isRead,
    onOpenImage,
    onReply,
}: {
    message: Message;
    isMine: boolean;
    isRead: boolean;
    onOpenImage: (url: string) => void;
    onReply: (message: Message) => void;
}) {
    const [showActions, setShowActions] = useState(false);
    const isImage = message.type === 'image' && message.fileUrl;
    const reactions = message.reactions ?? [];

    return (
        <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className={`group relative flex w-full ${isMine ? 'justify-end' : 'justify-start'}`}
            onMouseLeave={() => setShowActions(false)}
        >
            <div className={`relative max-w-[78%] sm:max-w-[62%] ${reactions.length > 0 ? 'mb-3' : ''}`}>
                <div
                    className={[
                        'px-3.5 py-2.5 rounded-[var(--radius-bubble)]',
                        isMine
                            ? 'bg-lamp text-ink rounded-br-sm'
                            : 'bg-velvet-lifted text-chalk rounded-bl-sm',
                        message.pending ? 'opacity-60' : '',
                        isImage ? 'p-1.5' : '',
                    ].join(' ')}
                >
                    {message.replyTo && (
                        // A snapshot taken when the reply was sent, so it still
                        // reads correctly even if the original has scrolled away.
                        <div
                            className={`mb-1.5 rounded-lg border-l-2 px-2 py-1 text-[0.78rem] ${
                                isMine
                                    ? 'border-ink/40 bg-ink/10 text-ink/70'
                                    : 'border-lamp-dim bg-ink/40 text-dust'
                            }`}
                        >
                            <span className="block font-medium">{message.replyTo.sender}</span>
                            <span className="line-clamp-2 block">
                                {message.replyTo.type === 'image' ? 'Photo' : message.replyTo.text}
                            </span>
                        </div>
                    )}

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
                        className={`mt-1 flex items-center gap-1 text-[0.66rem] ${
                            isMine ? 'justify-end text-ink/55' : 'text-dust'
                        } ${isImage ? 'px-2 pb-1' : ''}`}
                    >
                        {message.failed && <AlertCircle size={11} aria-hidden="true" />}
                        <span>{message.failed ? 'Not sent' : formatTime(message.createdAt)}</span>

                        {/* Only her own messages carry a tick — a tick on his
                            would be telling him what he already knows. */}
                        {isMine && !message.pending && !message.failed && (
                            <span aria-label={isRead ? 'Read' : 'Sent'}>
                                {isRead ? <CheckCheck size={13} /> : <Check size={13} />}
                            </span>
                        )}
                    </div>
                </div>

                {reactions.length > 0 && (
                    <div
                        className={`absolute -bottom-2.5 flex gap-0.5 rounded-full border border-hairline bg-velvet px-1.5 py-0.5 text-[0.7rem] ${
                            isMine ? 'right-2' : 'left-2'
                        }`}
                    >
                        {reactions.map((reaction) => (
                            <span key={`${reaction.username}-${reaction.emoji}`}>{reaction.emoji}</span>
                        ))}
                    </div>
                )}
            </div>

            {/* Appears on hover, or on a tap of the smile on touch. */}
            <div
                className={`absolute top-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 ${
                    isMine ? 'right-full mr-1' : 'left-full ml-1'
                } ${showActions ? 'opacity-100' : ''}`}
            >
                <button
                    type="button"
                    aria-label="Reply"
                    onClick={() => onReply(message)}
                    className="rounded-full p-1.5 text-dust transition-colors hover:text-lamp"
                >
                    <CornerUpLeft size={14} />
                </button>
                <button
                    type="button"
                    aria-label="React"
                    onClick={() => setShowActions((v) => !v)}
                    className="rounded-full p-1.5 text-dust transition-colors hover:text-lamp"
                >
                    <Smile size={14} />
                </button>
            </div>

            <AnimatePresence>
                {showActions && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.92 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.92 }}
                        transition={{ duration: 0.12 }}
                        className={`absolute -top-9 z-10 flex gap-1 rounded-full border border-hairline bg-velvet px-2 py-1 shadow-xl ${
                            isMine ? 'right-0' : 'left-0'
                        }`}
                    >
                        {REACTIONS.map((emoji) => (
                            <button
                                key={emoji}
                                type="button"
                                onClick={() => {
                                    toggleReaction(message._id, emoji);
                                    setShowActions(false);
                                }}
                                className="rounded-full px-1 text-base transition-transform hover:scale-125"
                            >
                                {emoji}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
