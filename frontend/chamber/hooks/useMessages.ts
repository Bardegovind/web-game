import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Message } from '../types';

export const messagesKey = (peer: string) => ['messages', peer] as const;

export function useMessages(peer: string | null) {
    return useQuery({
        queryKey: messagesKey(peer ?? ''),
        queryFn: () => api.get<{ messages: Message[] }>(`/chat/messages/${peer}`)
            .then((r) => r.messages),
        enabled: Boolean(peer),
        staleTime: 5_000,
    });
}
