import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../api/client';
import { useAuthStore } from '../stores/authStore';
import { todayKey } from './useChamber';
import type { Nudge, Reason, Relationship } from '../types';

export const usKey = ['us'] as const;
export const reasonsKey = ['reasons'] as const;
export const pendingNudgeKey = ['nudge', 'pending'] as const;

/** Every chamber query waits until she has actually entered. */
function useInside() {
    return useAuthStore((s) => s.isInside);
}

/**
 * Each screen's query, defined once, so a hook and the entry prefetch fetch
 * exactly the same thing into the same cache entry. Mirrors useChamber.ts.
 */
export const usQuery = () =>
    queryOptions({
        queryKey: usKey,
        queryFn: () => api.get<Relationship>('/chamber/us'),
        staleTime: 30_000,
    });

export const reasonsQuery = () =>
    queryOptions({
        queryKey: reasonsKey,
        queryFn: () => api.get<{ reasons: Reason[] }>('/chamber/reasons').then((r) => r.reasons),
        staleTime: 30_000,
    });

export const pendingNudgeQuery = () =>
    queryOptions({
        queryKey: pendingNudgeKey,
        queryFn: () => api.get<{ nudges: Nudge[] }>('/chamber/nudge/pending').then((r) => r.nudges),
        staleTime: 30_000,
    });

export function useUs() {
    return useQuery({ ...usQuery(), enabled: useInside(), refetchOnMount: 'always' });
}

export function useReasons() {
    return useQuery({ ...reasonsQuery(), enabled: useInside(), refetchOnMount: 'always' });
}

export function usePendingNudges() {
    return useQuery({ ...pendingNudgeQuery(), enabled: useInside(), refetchOnMount: 'always' });
}

/** Setting the day they started also changes what Today says about it. */
export function useSetUs() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (date: string) => api.put<Relationship>('/chamber/us', { date }),
        onSuccess: (data) => {
            queryClient.setQueryData(usKey, data);
            queryClient.invalidateQueries({ queryKey: todayKey });
        },
    });
}

export function useAddReason() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (text: string) => api.post<{ reason: Reason }>('/chamber/reasons', { text }).then((r) => r.reason),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: reasonsKey });
            // A new reason can become today's, so Today may change too.
            queryClient.invalidateQueries({ queryKey: todayKey });
        },
    });
}

export function useRemoveReason() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => api.delete(`/chamber/reasons/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: reasonsKey });
            // The one just removed could have been today's featured reason.
            queryClient.invalidateQueries({ queryKey: todayKey });
        },
    });
}

type NudgeResult = { sent: true } | { sent: false; reason: 'too-soon' };

/**
 * Sends a nudge. The 60s cooldown comes back as an HTTP 429 with no
 * `message`, so it is folded into a normal result here rather than left to
 * surface as a generic ApiError — a double tap should read as "already
 * sent", not as a failure.
 */
export function useSendNudge() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (): Promise<NudgeResult> => {
            try {
                await api.post('/chamber/nudge');
                return { sent: true };
            } catch (error) {
                if (error instanceof ApiError && error.status === 429) {
                    return { sent: false, reason: 'too-soon' };
                }
                throw error;
            }
        },
        onSuccess: (result) => {
            if (result.sent) queryClient.invalidateQueries({ queryKey: todayKey });
        },
    });
}

export function useMarkNudgesSeen() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => api.post<{ seen: number }>('/chamber/nudge/seen'),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: pendingNudgeKey });
            queryClient.invalidateQueries({ queryKey: todayKey });
        },
    });
}
