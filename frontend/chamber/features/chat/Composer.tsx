import { useRef, useState } from 'react';
import { Image as ImageIcon, Send, Smile } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

import { burstHearts } from '../../app/heartBurst';
import { HeartGlyph } from '../../app/LoveBackdrop';

const EMOJI = [
    '😊', '😂', '🔥', '❤️', '👍', '🙏', '💯', '✨',
    '😎', '🎉', '😢', '😍', '🤔', '🙌', '🚀', '⭐',
    '🤣', '🥺', '😭', '🤩', '👋', '👏', '🤝', '✅',
];

export function Composer({
    onSend,
    onPhoto,
    onTyping,
    disabled,
}: {
    onSend: (text: string) => void;
    onPhoto: (file: File) => void;
    onTyping: (isTyping: boolean) => void;
    disabled: boolean;
}) {
    const [text, setText] = useState('');
    const [showEmoji, setShowEmoji] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);
    const sendButton = useRef<HTMLButtonElement>(null);
    const stopTimer = useRef<number | undefined>(undefined);

    function submit() {
        const trimmed = text.trim();
        if (!trimmed) return;

        onSend(trimmed);
        setText('');
        onTyping(false);
        window.clearTimeout(stopTimer.current);

        // Only once the message is already on its way.
        burstHearts(sendButton.current);
    }

    function handleChange(value: string) {
        setText(value);
        onTyping(true);

        // The server expires this on its own, but stopping promptly keeps the
        // indicator honest while she is thinking.
        window.clearTimeout(stopTimer.current);
        stopTimer.current = window.setTimeout(() => onTyping(false), 1500);
    }

    return (
        <div className="relative px-3 pt-2 pb-3">
            <AnimatePresence>
                {showEmoji && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={{ duration: 0.15 }}
                        className="glass-solid absolute bottom-full left-3 mb-1 grid w-64 grid-cols-8 gap-1 rounded-2xl p-2"
                    >
                        {EMOJI.map((emoji) => (
                            <button
                                key={emoji}
                                type="button"
                                onClick={() => {
                                    setText((t) => t + emoji);
                                    setShowEmoji(false);
                                }}
                                className="rounded-lg p-1 text-lg transition-colors hover:bg-white/[0.07]"
                            >
                                {emoji}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="glass flex items-end gap-1 p-1.5">
                <button
                    type="button"
                    aria-label="Emoji"
                    onClick={() => setShowEmoji((v) => !v)}
                    className="rounded-full p-2.5 text-dust transition-colors hover:text-lamp"
                >
                    <Smile size={20} />
                </button>

                <button
                    type="button"
                    aria-label="Send a photo"
                    onClick={() => fileInput.current?.click()}
                    className="rounded-full p-2.5 text-dust transition-colors hover:text-lamp"
                >
                    <ImageIcon size={20} />
                </button>
                <input
                    ref={fileInput}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) onPhoto(file);
                        e.target.value = '';
                    }}
                />

                <textarea
                    rows={1}
                    value={text}
                    disabled={disabled}
                    onChange={(e) => handleChange(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            submit();
                        }
                    }}
                    placeholder="Say something"
                    className="field chamber-scroll max-h-28 min-w-0 flex-1 resize-none rounded-2xl px-4 py-2 text-[0.95rem] leading-6"
                />

                <button
                    ref={sendButton}
                    type="button"
                    onClick={submit}
                    disabled={!text.trim() || disabled}
                    aria-label="Send"
                    className="btn-love relative ml-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl disabled:opacity-40"
                >
                    <Send size={17} className="-ml-0.5" />
                    <HeartGlyph size={7} className="absolute top-1.5 right-1.5 text-white/85" />
                </button>
            </div>
        </div>
    );
}
