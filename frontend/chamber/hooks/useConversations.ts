import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Conversation } from '../types';
import { useAuthStore } from '../stores/authStore';

export const conversationsKey = ['conversations'] as const;

export function useConversations() {
    // Hooks run before App's early return, so without this the chamber calls the
    // API while she is still on the game screen and collects 401s for nothing.
    const isInside = useAuthStore((s) => s.isInside);

    return useQuery({
        enabled: isInside,
        queryKey: conversationsKey,
        queryFn: () => api.get<{ conversations: Conversation[] }>('/chat/conversations')
            .then((r) => r.conversations),
        // Unread counts come from the server, so they stay correct across a
        // refresh or a reconnect. Refetching on focus keeps them honest when
        // she comes back to the tab.
        refetchOnWindowFocus: true,
        staleTime: 10_000,
    });
}

export function useMarkRead() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (peer: string) => api.post(`/chat/read/${peer}`),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: conversationsKey }),
    });
}
