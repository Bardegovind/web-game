import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuthStore } from '../stores/authStore';
import type { BucketItem, DailyQuestion, Letter, StoryEntry, Today } from '../types';

export const todayKey = ['today'] as const;
export const lettersKey = ['letters'] as const;
export const storyKey = ['story'] as const;
export const bucketKey = ['bucket'] as const;
export const questionKey = ['question'] as const;

/** Every chamber query waits until she has actually entered. */
function useInside() {
    return useAuthStore((s) => s.isInside);
}

/**
 * Each screen's query, defined once, so a hook and the entry prefetch fetch
 * exactly the same thing into the same cache entry.
 */
export const todayQuery = () =>
    queryOptions({
        queryKey: todayKey,
        queryFn: () => api.get<{ today: Today }>('/chamber/today').then((r) => r.today),
        staleTime: 30_000,
    });

export const lettersQuery = () =>
    queryOptions({
        queryKey: lettersKey,
        queryFn: () => api.get<{ letters: Letter[]; prompts: string[] }>('/chamber/letters'),
        staleTime: 30_000,
    });

export const storyQuery = () =>
    queryOptions({
        queryKey: storyKey,
        queryFn: () => api.get<{ entries: StoryEntry[] }>('/chamber/story').then((r) => r.entries),
        staleTime: 60_000,
    });

export const bucketQuery = () =>
    queryOptions({
        queryKey: bucketKey,
        queryFn: () => api.get<{ items: BucketItem[] }>('/chamber/bucket').then((r) => r.items),
        staleTime: 30_000,
    });

export const questionQuery = () =>
    queryOptions({
        queryKey: questionKey,
        queryFn: () => api.get<{ question: DailyQuestion }>('/chamber/question').then((r) => r.question),
        staleTime: 60_000,
    });

export function useToday() {
    // Prefetched data is shown at once and refreshed on open, so something
    // written after entry (a message, a letter, an answer) still appears.
    return useQuery({ ...todayQuery(), enabled: useInside(), refetchOnWindowFocus: true, refetchOnMount: 'always' });
}

export function useLetters() {
    return useQuery({ ...lettersQuery(), enabled: useInside(), refetchOnMount: 'always' });
}

export function useOpenLetter() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) =>
            api.post<{ letter: Letter }>(`/chamber/letters/${id}/open`).then((r) => r.letter),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: lettersKey });
            queryClient.invalidateQueries({ queryKey: todayKey });
        },
    });
}

export function useWriteLetter() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (letter: { prompt: string; body: string }) =>
            api.post('/chamber/letters', letter),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: lettersKey }),
    });
}

export function useStory() {
    return useQuery({ ...storyQuery(), enabled: useInside(), refetchOnMount: 'always' });
}

export function useAddStoryEntry() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (entry: { title: string; happenedAt: string; note?: string; emoji?: string; place?: string }) =>
            api.post('/chamber/story', entry),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: storyKey }),
    });
}

export function useBucket() {
    return useQuery({ ...bucketQuery(), enabled: useInside(), refetchOnMount: 'always' });
}

export function useAddBucketItem() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (text: string) => api.post('/chamber/bucket', { text }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: bucketKey }),
    });
}

export function useToggleBucketItem() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) =>
            fetch(`/api/chamber/bucket/${id}`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${localStorage.getItem('chamber_token') ?? ''}` },
            }).then((r) => r.json()),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: bucketKey }),
    });
}

export function useQuestion() {
    return useQuery({ ...questionQuery(), enabled: useInside(), refetchOnMount: 'always' });
}

export function useAnswerQuestion() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (text: string) => api.post('/chamber/question', { text }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: questionKey });
            queryClient.invalidateQueries({ queryKey: todayKey });
        },
    });
}
