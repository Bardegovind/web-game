import { motion } from 'framer-motion';
import type { Conversation } from '../../types';
import { formatTime, formatDayLabel, isSameDay } from '../../utils/time';
import { usePresenceStore } from '../../stores/presenceStore';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/ErrorState';

/** Today shows a time; anything older shows the day it happened. */
function whenLabel(iso: string | null): string {
    if (!iso) return '';
    return isSameDay(iso, new Date()) ? formatTime(iso) : formatDayLabel(iso);
}

export function ConversationList({
    conversations,
    activePeer,
    isLoading,
    isError,
    onRetry,
    onSelect,
}: {
    conversations: Conversation[];
    activePeer: string | null;
    isLoading: boolean;
    isError: boolean;
    onRetry: () => void;
    onSelect: (peer: string) => void;
}) {
    const online = usePresenceStore((s) => s.online);

    if (isLoading) {
        return (
            <div className="space-y-2 p-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
            </div>
        );
    }

    if (isError) {
        return <ErrorState title="Couldn't load your conversations." onRetry={onRetry} />;
    }

    if (conversations.length === 0) {
        return <p className="px-4 py-10 text-center text-sm text-dust">No one here yet.</p>;
    }

    return (
        <ul className="chamber-scroll min-h-0 flex-1 overflow-y-auto p-2">
            {conversations.map((conversation) => {
                const isOnline = online[conversation.username] ?? conversation.isOnline;
                const isActive = activePeer === conversation.username;

                return (
                    <li key={conversation.username}>
                        <motion.button
                            type="button"
                            whileTap={{ scale: 0.99 }}
                            onClick={() => onSelect(conversation.username)}
                            className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors ${
                                isActive ? 'bg-velvet-lifted' : 'hover:bg-velvet'
                            }`}
                        >
                            <span className="relative shrink-0">
                                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-velvet-lifted font-display text-lg text-lamp">
                                    {conversation.username.charAt(0)}
                                </span>
                                {isOnline && (
                                    <span
                                        className="absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 border-ink bg-rose"
                                        aria-label="Online"
                                    />
                                )}
                            </span>

                            <span className="min-w-0 flex-1">
                                <span className="flex items-baseline justify-between gap-2">
                                    <span className="truncate font-display text-[1.05rem] text-chalk">
                                        {conversation.username}
                                    </span>
                                    <span className="shrink-0 text-[0.68rem] text-dust">
                                        {whenLabel(conversation.lastMessageAt)}
                                    </span>
                                </span>
                                <span className="mt-0.5 flex items-center justify-between gap-2">
                                    <span className="truncate text-sm text-dust">
                                        {conversation.lastMessage?.text ?? 'Nothing yet'}
                                    </span>
                                    {conversation.unreadCount > 0 && (
                                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-lamp px-1.5 text-[0.68rem] font-semibold text-ink">
                                            {conversation.unreadCount}
                                        </span>
                                    )}
                                </span>
                            </span>
                        </motion.button>
                    </li>
                );
            })}
        </ul>
    );
}
