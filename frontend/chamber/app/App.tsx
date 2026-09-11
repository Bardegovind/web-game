import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';

import { Entrance } from './Entrance';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { ConversationList } from '../features/chat/ConversationList';
import { Conversation } from '../features/chat/Conversation';
import { MemoryGrid } from '../features/memories/MemoryGrid';
import { Lightbox } from '../features/memories/Lightbox';
import { Today } from '../features/today/Today';
import { Letters } from '../features/letters/Letters';
import { Story } from '../features/story/Story';
import { Bucket } from '../features/bucket/Bucket';

import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useConversations, conversationsKey } from '../hooks/useConversations';
import { messagesKey } from '../hooks/useMessages';
import { useToday, todayKey } from '../hooks/useChamber';
import { connectSocket, disconnectSocket, setSocketCallbacks } from '../socket/socketClient';

const TABS = ['today', 'messages', 'moments', 'letters', 'story', 'list'] as const;
type Tab = (typeof TABS)[number];

export function App() {
    const { username, token, isInside, leave } = useAuthStore();
    const [tab, setTab] = useState<Tab>('today');
    const [showEntrance, setShowEntrance] = useState(true);
    const [lightbox, setLightbox] = useState<string | null>(null);

    const activePeer = useChatStore((s) => s.activePeer);
    const setActivePeer = useChatStore((s) => s.setActivePeer);
    const addMessage = useChatStore((s) => s.addMessage);

    const queryClient = useQueryClient();
    const { data: conversations, isLoading, isError, refetch } = useConversations();
    const { data: today } = useToday();

    useEffect(() => {
        if (!isInside || !token) return;

        setSocketCallbacks({
            onMessage: (message) => {
                addMessage(message.sender, message);
                queryClient.invalidateQueries({ queryKey: conversationsKey });
                queryClient.invalidateQueries({ queryKey: todayKey });
            },
            onRead: () => queryClient.invalidateQueries({ queryKey: conversationsKey }),
            onResync: () => {
                // Whatever arrived while the socket was away is fetched rather
                // than guessed at.
                queryClient.invalidateQueries({ queryKey: conversationsKey });
                queryClient.invalidateQueries({ queryKey: todayKey });
                const peer = useChatStore.getState().activePeer;
                if (peer) queryClient.invalidateQueries({ queryKey: messagesKey(peer) });
            },
        });

        connectSocket(token);
        return () => disconnectSocket();
    }, [isInside, token, addMessage, queryClient]);

    if (!isInside) return null;

    const list = conversations ?? [];
    const active = list.find((c) => c.username === activePeer) ?? null;

    /** A quiet count beside a word, only when there is something to say. */
    const badgeFor = (name: Tab): number => {
        if (name === 'messages') return today?.unreadMessages ?? 0;
        if (name === 'letters') return today?.unopenedLetters ?? 0;
        return 0;
    };

    return (
        <div className="chamber-root fixed inset-0 z-50 flex flex-col">
            <AnimatePresence>
                {showEntrance && <Entrance onDone={() => setShowEntrance(false)} />}
            </AnimatePresence>

            <ConnectionBanner />

            <header className="flex items-center justify-between px-4 pt-4 pb-2">
                <div>
                    <h1 className="font-display text-xl leading-none text-chalk italic">ours</h1>
                    <p className="mt-1 text-xs text-dust">{username}</p>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        disconnectSocket();
                        leave();
                        // The game screen comes back and the corners start
                        // listening again.
                        window.dispatchEvent(new CustomEvent('chamber:left'));
                    }}
                    aria-label="Leave"
                    className="rounded-full p-2 text-dust transition-colors hover:text-chalk"
                >
                    <X size={18} />
                </button>
            </header>

            {/* Scrolls sideways on a narrow screen rather than wrapping into a
                second row or shrinking into icons. */}
            <nav className="chamber-scroll flex gap-5 overflow-x-auto border-b border-hairline px-4">
                {TABS.map((name) => {
                    const badge = badgeFor(name);

                    return (
                        <button
                            key={name}
                            type="button"
                            onClick={() => setTab(name)}
                            className={`relative shrink-0 pb-2.5 font-display text-[0.95rem] transition-colors ${
                                tab === name ? 'text-chalk' : 'text-dust hover:text-chalk/80'
                            }`}
                        >
                            {name}
                            {badge > 0 && (
                                <span className="ml-1.5 align-super text-[0.6rem] text-lamp">{badge}</span>
                            )}
                            {tab === name && (
                                <motion.span
                                    layoutId="tab-underline"
                                    className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-lamp"
                                />
                            )}
                        </button>
                    );
                })}
            </nav>

            <main className="flex min-h-0 flex-1 flex-col">
                {tab === 'today' && <Today onOpenImage={setLightbox} />}
                {tab === 'moments' && <MemoryGrid onOpenImage={setLightbox} />}
                {tab === 'letters' && <Letters />}
                {tab === 'story' && <Story />}
                {tab === 'list' && <Bucket />}

                {tab === 'messages' && (
                    <div className="flex h-full min-h-0">
                        {/* Mobile shows one at a time; a squeezed three-pane
                            layout on a phone helps no one. */}
                        <div
                            className={`min-h-0 w-full shrink-0 flex-col md:flex md:w-80 md:border-r md:border-hairline ${
                                activePeer ? 'hidden md:flex' : 'flex'
                            }`}
                        >
                            <ConversationList
                                conversations={list}
                                activePeer={activePeer}
                                isLoading={isLoading}
                                isError={isError}
                                onRetry={() => refetch()}
                                onSelect={setActivePeer}
                            />
                        </div>

                        <div className={`min-h-0 min-w-0 flex-1 ${activePeer ? 'block' : 'hidden md:block'}`}>
                            {activePeer ? (
                                <Conversation
                                    peer={activePeer}
                                    lastSeen={active?.lastSeen ?? null}
                                    onBack={() => setActivePeer(null)}
                                    onOpenImage={setLightbox}
                                />
                            ) : (
                                <div className="flex h-full items-center justify-center px-6 text-center">
                                    <p className="text-sm text-dust">Pick a conversation.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>

            <Lightbox url={lightbox} onClose={() => setLightbox(null)} />
        </div>
    );
}
