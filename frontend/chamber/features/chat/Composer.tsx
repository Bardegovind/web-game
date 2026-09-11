import { useRef, useState } from 'react';
import { Image as ImageIcon, Send, Smile } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

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
    const stopTimer = useRef<number | undefined>(undefined);

    function submit() {
        const trimmed = text.trim();
        if (!trimmed) return;

        onSend(trimmed);
        setText('');
        onTyping(false);
        window.clearTimeout(stopTimer.current);
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
        <div className="relative border-t border-hairline bg-ink/80 px-3 py-3 backdrop-blur">
            <AnimatePresence>
                {showEmoji && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={{ duration: 0.15 }}
                        className="absolute bottom-full left-3 mb-2 grid w-64 grid-cols-8 gap-1 rounded-2xl border border-hairline bg-velvet p-2 shadow-2xl"
                    >
                        {EMOJI.map((emoji) => (
                            <button
                                key={emoji}
                                type="button"
                                onClick={() => {
                                    setText((t) => t + emoji);
                                    setShowEmoji(false);
                                }}
                                className="rounded-lg p-1 text-lg transition-colors hover:bg-velvet-lifted"
                            >
                                {emoji}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="flex items-end gap-2">
                <button
                    type="button"
                    aria-label="Emoji"
                    onClick={() => setShowEmoji((v) => !v)}
                    className="rounded-full p-2 text-dust transition-colors hover:text-lamp"
                >
                    <Smile size={20} />
                </button>

                <button
                    type="button"
                    aria-label="Send a photo"
                    onClick={() => fileInput.current?.click()}
                    className="rounded-full p-2 text-dust transition-colors hover:text-lamp"
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
                    className="chamber-scroll max-h-28 flex-1 resize-none rounded-2xl border border-hairline bg-velvet px-4 py-2.5 text-[0.95rem] text-chalk placeholder:text-dust/70 focus:border-lamp-dim focus:outline-none"
                />

                <button
                    type="button"
                    onClick={submit}
                    disabled={!text.trim() || disabled}
                    aria-label="Send"
                    className="rounded-full bg-lamp p-2.5 text-ink transition-opacity disabled:opacity-30"
                >
                    <Send size={18} />
                </button>
            </div>
        </div>
    );
}
