import { useReducedMotion } from 'framer-motion';

import { cn } from '@/lib/utils';
import { isPeerOnline } from '../presence/onlineStatus';
import { usePresenceStore } from '../stores/presenceStore';
import type { Conversation } from '../types';

/**
 * Whether the other person is here, in the header — so it reads from every
 * screen, not only from the chat list.
 *
 * Deliberately the same rule as the dot beside their name in Chat
 * (`isPeerOnline`): live word first, then the list the server hands this
 * connection, then the stored value — so the two can never disagree.
 */
export function PeerPresence({ me, conversations }: {
    me: string | null;
    conversations: Conversation[] | undefined;
}) {
    const online = usePresenceStore((s) => s.online);
    const listedOnline = usePresenceStore((s) => s.listedOnline);
    const reduceMotion = useReducedMotion();

    const peer = conversations?.find((c) => c.username !== me);
    if (!peer) return null;

    const here = isPeerOnline(peer.username, { online, listedOnline }, peer.isOnline);

    // The separator belongs to the name: with no one to show yet, the header
    // must not end in a dangling "·".
    return (
        <>
            <span aria-hidden="true" className="text-chalk/25">&middot;</span>
            <span
                className="flex items-center gap-1.5"
                aria-label={here ? `${peer.username} is here` : `${peer.username} is not here`}
            >
                <span
                    aria-hidden="true"
                    className={cn(
                        'h-2 w-2 shrink-0 rounded-full',
                        here
                            ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.85)]'
                            : 'bg-chalk/25'
                    )}
                    style={here && !reduceMotion ? { animation: 'chamber-heartbeat 2.4s ease-in-out infinite' } : undefined}
                />
                <span className={cn('truncate', here ? 'text-emerald-300' : 'text-dust')}>
                    {peer.username}
                </span>
            </span>
        </>
    );
}
