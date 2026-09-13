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

    // This mounts once and never again (App never unmounts), so it relies on
    // socket invalidation (App's onMessage/onRead/onResync invalidate
    // conversationsKey) plus refetching on window focus to stay fresh, rather
    // than on a remount that will never happen.
    return useQuery({ ...conversationsQuery(), enabled: isInside, refetchOnWindowFocus: true });
}

export function useMarkRead() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (peer: string) => api.post(`/chat/read/${peer}`),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: conversationsKey }),
    });
}
