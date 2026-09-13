import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
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

import { BottomNav } from './BottomNav';
import { MoreSheet } from './MoreSheet';
import { sectionFor, type Screen, type Section } from './navigation';

import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useConversations, conversationsKey } from '../hooks/useConversations';
import { messagesKey } from '../hooks/useMessages';
import { useToday, todayKey } from '../hooks/useChamber';
import { connectSocket, disconnectSocket, setSocketCallbacks } from '../socket/socketClient';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { createPresenceNotifier, type PresenceNotifier } from '../presence/presenceNotifier';

export function App() {
    const { username, token, isInside, leave } = useAuthStore();
    const [screen, setScreen] = useState<Screen>('today');
    const [moreOpen, setMoreOpen] = useState(false);
    const [root, setRoot] = useState<HTMLDivElement | null>(null);
    const [showEntrance, setShowEntrance] = useState(true);
    const [lightbox, setLightbox] = useState<string | null>(null);

    const activePeer = useChatStore((s) => s.activePeer);
    const setActivePeer = useChatStore((s) => s.setActivePeer);
    const addMessage = useChatStore((s) => s.addMessage);

    const queryClient = useQueryClient();
    const { data: conversations, isLoading, isError, refetch } = useConversations();
    const { data: today } = useToday();

    const notifierRef = useRef<PresenceNotifier | null>(null);

    // One notifier per visit. It decides; Sonner shows.
    useEffect(() => {
        if (!isInside || !username) return;

        const notifier = createPresenceNotifier({
            me: username,
            notify: ({ kind, username: who }) => {
                if (kind === 'arrived') {
                    toast(`${who} is here`, {
                        icon: <span aria-hidden="true" className="block size-2 rounded-full bg-emerald-400" />,
                    });
                } else {
                    toast(`${who} left`);
                }
            },
        });

        notifierRef.current = notifier;
        return () => {
            notifier.dispose();
            notifierRef.current = null;
        };
    }, [isInside, username]);

    // Whoever is already here when she enters is known, not announced.
    useEffect(() => {
        if (conversations) notifierRef.current?.seed(conversations);
    }, [conversations]);

    useEffect(() => {
        if (!isInside || !token) return;

        setSocketCallbacks({
            onMessage: (message) => {
                addMessage(message.sender, message);
                queryClient.invalidateQueries({ queryKey: conversationsKey });
                queryClient.invalidateQueries({ queryKey: todayKey });
            },
            onRead: () => queryClient.invalidateQueries({ queryKey: conversationsKey }),
            onPresence: (update) => notifierRef.current?.handle(update),
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

    const badges = {
        chat: today?.unreadMessages ?? 0,
        letters: today?.unopenedLetters ?? 0,
    };

    return (
        <div ref={setRoot} className="chamber-root fixed inset-0 z-50 flex flex-col">
            <AnimatePresence>
                {showEntrance && <Entrance onDone={() => setShowEntrance(false)} />}
            </AnimatePresence>

            <ConnectionBanner />
            <Toaster />

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

            <main className="flex min-h-0 flex-1 flex-col">
                {screen === 'today' && <Today onOpenImage={setLightbox} />}
                {screen === 'moments' && <MemoryGrid onOpenImage={setLightbox} />}
                {screen === 'letters' && <Letters />}
                {screen === 'story' && <Story />}
                {screen === 'list' && <Bucket />}

                {screen === 'chat' && (
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

            <BottomNav
                active={sectionFor(screen)}
                badges={badges}
                onSelect={(section: Section) => {
                    if (section === 'more') {
                        setMoreOpen(true);
                        return;
                    }
                    setScreen(section);
                }}
            />

            <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} container={root} onSelect={setScreen} />

            <Lightbox url={lightbox} onClose={() => setLightbox(null)} />
        </div>
    );
}
