import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';

import { Entrance } from './Entrance';
import { CursorGlow, HeartGlyph, LoveBackdrop } from './LoveBackdrop';
import { HeartBurstLayer } from './heartBurst';
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
import { directionBetween, sectionFor, type Screen, type Section } from './navigation';
import { ScreenStage } from './ScreenStage';
import { prefetchChamber } from './prefetch';

import type { Conversation as ConversationSummary } from '../types';
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
    const [direction, setDirection] = useState<-1 | 0 | 1>(0);
    const [showEntrance, setShowEntrance] = useState(true);
    const [lightbox, setLightbox] = useState<string | null>(null);

    const activePeer = useChatStore((s) => s.activePeer);
    const setActivePeer = useChatStore((s) => s.setActivePeer);
    const addMessage = useChatStore((s) => s.addMessage);

    const queryClient = useQueryClient();
    const { data: conversations, isLoading, isError, refetch } = useConversations();
    const { data: today } = useToday();

    const notifierRef = useRef<PresenceNotifier | null>(null);

    // The socket callbacks are registered once per visit, so they read the
    // current screen through a ref.
    const screenRef = useRef(screen);
    useEffect(() => {
        screenRef.current = screen;
    }, [screen]);

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

        // Coming back in the same page, the last visit's list is already
        // cached and may never change reference again, so the new notifier
        // learns from it now rather than waiting for a change.
        const cached = queryClient.getQueryData<ConversationSummary[]>(conversationsKey);
        if (cached) notifier.seed(cached);

        notifierRef.current = notifier;
        return () => {
            notifier.dispose();
            notifierRef.current = null;
        };
    }, [isInside, username, queryClient]);

    // Whoever is already here when she enters is known, not announced, and
    // every newer list corrects what an older one said.
    useEffect(() => {
        if (conversations) notifierRef.current?.seed(conversations);
    }, [conversations, isInside, username]);

    // Every screen's data loads on entry, so no tab opens onto a placeholder.
    useEffect(() => {
        if (isInside && token) void prefetchChamber(queryClient);
    }, [isInside, token, queryClient]);

    useEffect(() => {
        if (!isInside || !token) return;

        setSocketCallbacks({
            onMessage: (message) => {
                addMessage(message.sender, message);

                // Her open conversation reads this the moment it lands, and
                // that read refreshes the list and the badge. Refreshing them
                // here as well would race the read and flash a count for a
                // message already on screen.
                const beingRead =
                    screenRef.current === 'chat' && useChatStore.getState().activePeer === message.sender;
                if (beingRead) return;

                queryClient.invalidateQueries({ queryKey: conversationsKey });
                queryClient.invalidateQueries({ queryKey: todayKey });
            },
            onRead: () => queryClient.invalidateQueries({ queryKey: conversationsKey }),
            onPresence: (update) => notifierRef.current?.handle(update),
            onOnlineList: (usernames) => {
                // The server's word on who is here now: anyone else in the
                // conversations list is not.
                const here = new Set(usernames);
                const everyone = queryClient.getQueryData<ConversationSummary[]>(conversationsKey) ?? [];
                notifierRef.current?.seed([
                    ...usernames.map((name) => ({ username: name, isOnline: true })),
                    ...everyone
                        .filter((conversation) => !here.has(conversation.username))
                        .map((conversation) => ({ username: conversation.username, isOnline: false })),
                ]);
            },
            onResync: () => {
                // A new connection. What the last one heard live may no longer
                // be true, so the lists fetched for this one may correct it;
                // anything heard live from here on still wins.
                notifierRef.current?.reset();

                // Whatever arrived while the socket was away is fetched rather
                // than guessed at.
                const listFetchedAt = queryClient.getQueryState(conversationsKey)?.dataUpdatedAt;
                void queryClient.invalidateQueries({ queryKey: conversationsKey }).then(() => {
                    const list = queryClient.getQueryState<ConversationSummary[]>(conversationsKey);
                    // A refetch that failed leaves the old list, which is no news.
                    if (list?.data && list.dataUpdatedAt !== listFetchedAt) notifierRef.current?.seed(list.data);
                });
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

    /** Moves to a screen, sliding from the side of the tab that was tapped. */
    const go = (next: Screen) => {
        setDirection(directionBetween(screen, next));
        setScreen(next);
    };

    return (
        <div ref={setRoot} className="chamber-root fixed inset-0 z-50 flex flex-col">
            {/* Decoration only, behind everything, and only while inside. */}
            <LoveBackdrop />
            <CursorGlow />

            <AnimatePresence>
                {showEntrance && <Entrance onDone={() => setShowEntrance(false)} />}
            </AnimatePresence>

            <ConnectionBanner />
            <Toaster />
            <HeartBurstLayer />

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

            <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                <ScreenStage screen={screen} direction={direction}>
                {screen === 'today' && <Today onOpenImage={setLightbox} />}
                {screen === 'moments' && <MemoryGrid onOpenImage={setLightbox} sheetContainer={root} />}
                {screen === 'letters' && <Letters />}
                {screen === 'story' && <Story />}
                {screen === 'list' && <Bucket />}

                {screen === 'chat' && (
                    <div className="flex h-full min-h-0 md:gap-3 md:px-4 md:pt-1 md:pb-4">
                        {/* Mobile shows one at a time; a squeezed three-pane
                            layout on a phone helps no one. */}
                        <div
                            className={`chat-pane min-h-0 w-full shrink-0 flex-col md:flex md:w-80 ${
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

                        <div className={`chat-pane min-h-0 min-w-0 flex-1 ${activePeer ? 'block' : 'hidden md:block'}`}>
                            {activePeer ? (
                                <Conversation
                                    peer={activePeer}
                                    lastSeen={active?.lastSeen ?? null}
                                    storedOnline={active?.isOnline}
                                    onBack={() => setActivePeer(null)}
                                    onOpenImage={setLightbox}
                                />
                            ) : (
                                <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                                    <HeartGlyph size={22} className="text-lamp/50" />
                                    <p className="text-sm text-dust">Pick a conversation.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
                </ScreenStage>
            </main>

            <BottomNav
                active={sectionFor(screen)}
                badges={badges}
                onSelect={(section: Section) => {
                    if (section === 'more') {
                        setMoreOpen(true);
                        return;
                    }
                    go(section);
                }}
            />

            <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} container={root} onSelect={go} />

            <Lightbox url={lightbox} onClose={() => setLightbox(null)} />
        </div>
    );
}
