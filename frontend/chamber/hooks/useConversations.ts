import { queryOptions, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Conversation } from '../types';
import { useAuthStore } from '../stores/authStore';

export const conversationsKey = ['conversations'] as const;

export const conversationsQuery = () =>
    queryOptions({
        queryKey: conversationsKey,
        queryFn: () => api.get<{ conversations: Conversation[] }>('/chat/conversations').then((r) => r.conversations),
        staleTime: 10_000,
    });

export function useConversations() {
    // Hooks run before App's early return, so without `enabled` the chamber
    // would call the API while she is still on the game screen.
    const isInside = useAuthStore((s) => s.isInside);

    // Unread counts come from the server, so refetching on focus keeps them
    // honest when she comes back to the tab.
    return useQuery({ ...conversationsQuery(), enabled: isInside, refetchOnWindowFocus: true, refetchOnMount: 'always' });
}

export function useMarkRead() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (peer: string) => api.post(`/chat/read/${peer}`),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: conversationsKey }),
    });
}
