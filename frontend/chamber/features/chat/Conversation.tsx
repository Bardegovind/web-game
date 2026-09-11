import { useEffect, useMemo, useRef } from 'react';
import { ChevronLeft } from 'lucide-react';
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

export function Conversation({
    peer,
    lastSeen,
    onBack,
    onOpenImage,
}: {
    peer: string;
    lastSeen: string | null;
    onBack: () => void;
    onOpenImage: (url: string) => void;
}) {
    const me = useAuthStore((s) => s.username);
    const isOnline = usePresenceStore((s) => s.online[peer]);
    const isTyping = usePresenceStore((s) => s.typingFrom[peer]);
    const queryClient = useQueryClient();
    const markRead = useMarkRead();

    const { data, isLoading, isError, refetch } = useMessages(peer);
    const stored = useChatStore((s) => s.messagesByPeer[peer]);
    const { setMessages, addMessage, markFailed } = useChatStore();
    const bottom = useRef<HTMLDivElement>(null);

    // Server history seeds the store; live messages are appended to it.
    useEffect(() => {
        if (data) setMessages(peer, data);
    }, [data, peer, setMessages]);

    // Opening a conversation is reading it.
    useEffect(() => {
        sendRead(peer);
        markRead.mutate(peer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [peer]);

    const messages = stored ?? data ?? [];

    useEffect(() => {
        bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
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
        });

        sendMessage({ receiver: peer, text, type: 'text', clientId });
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
        ? 'typing'
        : isOnline
            ? 'Online'
            : lastSeen
                ? `Last seen ${formatLastSeen(lastSeen)}`
                : 'Offline';

    return (
        <section className="flex h-full min-h-0 flex-col">
            <header className="flex items-center gap-3 border-b border-hairline px-3 py-3">
                <button
                    type="button"
                    onClick={onBack}
                    aria-label="Back to conversations"
                    className="-ml-1 rounded-full p-1.5 text-dust transition-colors hover:text-chalk md:hidden"
                >
                    <ChevronLeft size={20} />
                </button>
                <div className="min-w-0">
                    <h2 className="font-display text-lg leading-tight text-chalk">{peer}</h2>
                    <p className="text-xs text-dust">{status}</p>
                </div>
            </header>

            <div className="chamber-scroll min-h-0 flex-1 overflow-y-auto px-3 py-4">
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
                    <div className="space-y-2">
                        {withSeparators.map((row, i) =>
                            row.kind === 'day' ? (
                                <DaySeparator key={`day-${i}`} label={row.label} />
                            ) : (
                                <MessageBubble
                                    key={row.message._id}
                                    message={row.message}
                                    isMine={row.message.sender === me}
                                    onOpenImage={onOpenImage}
                                />
                            )
                        )}
                    </div>
                )}

                {isTyping && <TypingIndicator name={peer} />}
                <div ref={bottom} />
            </div>

            <Composer
                onSend={send}
                onPhoto={sendPhoto}
                onTyping={(typing) => sendTyping(peer, typing)}
                disabled={false}
            />
        </section>
    );
}
