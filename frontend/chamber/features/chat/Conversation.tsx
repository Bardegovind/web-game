import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';

import type { Message } from '../../types';
import { MessageBubble } from './MessageBubble';
import { DaySeparator } from './DaySeparator';
import { TypingIndicator } from './TypingIndicator';
import { Composer } from './Composer';
import { MessageSkeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/ErrorState';
import { formatDayLabel, formatLastSeen, isSameDay } from '../../utils/time';
import { useMessages, messagesKey } from '../../hooks/useMessages';
import { useChatStore } from '../../stores/chatStore';
import { usePresenceStore } from '../../stores/presenceStore';
import { useAuthStore } from '../../stores/authStore';
import { newClientId, sendMessage, sendRead, sendTyping } from '../../socket/socketClient';
import { api } from '../../api/client';
import { useMarkRead } from '../../hooks/useConversations';
import { isPeerOnline } from '../../presence/onlineStatus';

export function Conversation({
    peer,
    lastSeen,
    storedOnline,
    onBack,
    onOpenImage,
}: {
    peer: string;
    lastSeen: string | null;
    /** The conversations list's last-known value, used only until the socket has said. */
    storedOnline?: boolean;
    onBack: () => void;
    onOpenImage: (url: string) => void;
}) {
    const me = useAuthStore((s) => s.username);
    const online = usePresenceStore((s) => s.online);
    const listedOnline = usePresenceStore((s) => s.listedOnline);
    const isOnline = isPeerOnline(peer, { online, listedOnline }, storedOnline);
    const isTyping = usePresenceStore((s) => s.typingFrom[peer]);
    const queryClient = useQueryClient();
    const markRead = useMarkRead();

    const { data, isLoading, isError, refetch } = useMessages(peer);
    const stored = useChatStore((s) => s.messagesByPeer[peer]);
    const peerReadAt = useChatStore((s) => s.peerReadAt[peer]);
    const { setMessages, addMessage, markFailed } = useChatStore();
    const listRef = useRef<HTMLDivElement>(null);
    const [replyingTo, setReplyingTo] = useState<Message | null>(null);

    /** Tells the server this conversation has been read, over both paths it listens on. */
    function markConversationRead() {
        sendRead(peer);
        markRead.mutate(peer);
    }

    // Server history seeds the store; live messages are appended to it.
    useEffect(() => {
        if (data) setMessages(peer, data);
    }, [data, peer, setMessages]);

    // Opening a conversation is reading it.
    useEffect(() => {
        markConversationRead();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [peer]);

    const messages = stored ?? data ?? [];

    // The id of the newest message she sent us, so a fresh arrival can be
    // told apart from what was already here when this conversation opened.
    const latestIncomingId = useMemo(() => {
        for (let i = messages.length - 1; i >= 0; i--) {
            const message = messages[i];
            if (message && message.sender === peer) return message._id;
        }
        return null;
    }, [messages, peer]);

    // The newest of her messages that was already here when this conversation
    // opened — null if she had never written — or undefined until its history
    // has loaded and that is known.
    const seenIncomingIdRef = useRef<string | null | undefined>(undefined);
    const historyLoaded = !isLoading;

    useEffect(() => {
        seenIncomingIdRef.current = undefined;
    }, [peer]);

    // A message from her that arrives while this conversation is open is read
    // the same way opening it is, at most once per new latest message. Only
    // the history that was here on opening is skipped (the opening effect read
    // it) — her very first message is not history.
    //
    // No hidden-page catch-up is needed: chamber.js closes the chamber the
    // moment the page is hidden, which unmounts this. The visible check only
    // covers the instant in between.
    useEffect(() => {
        if (!historyLoaded) return;

        if (seenIncomingIdRef.current === undefined) {
            seenIncomingIdRef.current = latestIncomingId;
            return;
        }

        if (latestIncomingId === seenIncomingIdRef.current) return;
        seenIncomingIdRef.current = latestIncomingId;

        if (document.visibilityState === 'visible') markConversationRead();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [latestIncomingId, historyLoaded]);

    useEffect(() => {
        const list = listRef.current;
        if (list) list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
    }, [messages.length, isTyping]);

    /** Groups the run of messages under the day they belong to. */
    const withSeparators = useMemo(() => {
        const rows: Array<{ kind: 'day'; label: string } | { kind: 'message'; message: Message }> = [];
        let previous: string | null = null;

        for (const message of messages) {
            if (!previous || !isSameDay(previous, message.createdAt)) {
                rows.push({ kind: 'day', label: formatDayLabel(message.createdAt) });
            }
            rows.push({ kind: 'message', message });
            previous = message.createdAt;
        }
        return rows;
    }, [messages]);

    function send(text: string) {
        const clientId = newClientId();
        const quoted = replyingTo
            ? {
                messageId: replyingTo._id,
                sender: replyingTo.sender,
                text: replyingTo.text,
                type: replyingTo.type,
            }
            : null;

        // On screen immediately; the acknowledgement reconciles it rather than
        // adding a second copy.
        addMessage(peer, {
            _id: clientId,
            sender: me ?? '',
            receiver: peer,
            text,
            type: 'text',
            fileUrl: null,
            createdAt: new Date().toISOString(),
            clientId,
            pending: true,
            replyTo: quoted,
            reactions: [],
        });

        sendMessage({ receiver: peer, text, type: 'text', clientId, replyTo: quoted });
        setReplyingTo(null);
        window.setTimeout(() => {
            const current = useChatStore.getState().messagesByPeer[peer] ?? [];
            if (current.some((m) => m.clientId === clientId && m.pending)) markFailed(peer, clientId);
        }, 10_000);
    }

    async function sendPhoto(file: File) {
        const form = new FormData();
        form.append('file', file);

        try {
            const { fileUrl } = await api.upload<{ fileUrl: string }>('/chat/upload', form);
            sendMessage({ receiver: peer, type: 'image', fileUrl, clientId: newClientId() });
        } catch {
            queryClient.invalidateQueries({ queryKey: messagesKey(peer) });
        }
    }

    const status = isTyping
        ? 'typing…'
        : isOnline
            ? 'Online'
            : lastSeen
                ? `Last seen ${formatLastSeen(lastSeen)}`
                : 'Offline';

    return (
        <section className="flex h-full min-h-0 flex-col">
            <header className="flex items-center gap-3 border-b border-hairline px-4 py-3">
                <button
                    type="button"
                    onClick={onBack}
                    aria-label="Back to conversations"
                    className="-ml-1 rounded-full p-1.5 text-dust transition-colors hover:text-chalk md:hidden"
                >
                    <ChevronLeft size={20} />
                </button>
                <div className="min-w-0">
                    <h2 className="font-display text-lg leading-tight font-semibold text-chalk">{peer}</h2>
                    <p className={`text-xs ${isTyping ? 'text-lamp' : 'text-dust'}`}>{status}</p>
                </div>
            </header>

            <div
                ref={listRef}
                role="log"
                aria-label="Messages"
                className="chamber-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-4"
            >
                {isLoading && !stored ? (
                    <MessageSkeleton />
                ) : isError && messages.length === 0 ? (
                    <ErrorState
                        title="These messages didn't load. Everything you've written is still here."
                        onRetry={() => refetch()}
                    />
                ) : messages.length === 0 ? (
                    <p className="px-2 py-10 text-center text-sm text-dust">
                        Nothing here yet. Say the first thing.
                    </p>
                ) : (
                    <div className="space-y-2.5">
                        {withSeparators.map((row, i) =>
                            row.kind === 'day' ? (
                                <DaySeparator key={`day-${i}`} label={row.label} />
                            ) : (
                                <MessageBubble
                                    key={row.message._id}
                                    message={row.message}
                                    isMine={row.message.sender === me}
                                    isRead={
                                        Boolean(peerReadAt) &&
                                        new Date(row.message.createdAt) <= new Date(peerReadAt as string)
                                    }
                                    onOpenImage={onOpenImage}
                                    onReply={setReplyingTo}
                                />
                            )
                        )}
                    </div>
                )}

                <AnimatePresence>
                    {isTyping && (
                        <motion.div
                            key="typing-indicator"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 6 }}
                            transition={{ duration: 0.18, ease: 'easeOut' }}
                        >
                            <TypingIndicator name={peer} />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {replyingTo && (
                <div className="glass mx-3 mt-1 flex items-start gap-2 rounded-2xl px-3 py-2">
                    <div className="min-w-0 flex-1 border-l-2 border-lamp-dim pl-2">
                        <p className="font-display text-[0.72rem] font-medium text-lamp">Replying to {replyingTo.sender}</p>
                        <p className="truncate text-xs text-dust">
                            {replyingTo.type === 'image' ? 'Photo' : replyingTo.text}
                        </p>
                    </div>
                    <button
                        type="button"
                        aria-label="Cancel reply"
                        onClick={() => setReplyingTo(null)}
                        className="rounded-full p-1 text-dust transition-colors hover:text-chalk"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            <Composer
                onSend={send}
                onPhoto={sendPhoto}
                onTyping={(typing) => sendTyping(peer, typing)}
                disabled={false}
            />
        </section>
    );
}
