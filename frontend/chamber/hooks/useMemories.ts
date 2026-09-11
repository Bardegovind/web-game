import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Memory } from '../types';
import { useAuthStore } from '../stores/authStore';

export const memoriesKey = ['memories'] as const;

export function useMemories() {
    const isInside = useAuthStore((s) => s.isInside);

    return useQuery({
        enabled: isInside,
        queryKey: memoriesKey,
        queryFn: () => api.get<{ images: Memory[] }>('/gallery').then((r) => r.images),
        staleTime: 30_000,
    });
}

export function useUploadMemory() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (file: File) => {
            const form = new FormData();
            form.append('image', file);
            return api.upload<{ image: Memory }>('/gallery/upload', form);
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: memoriesKey }),
    });
}

export function useDeleteMemory() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => api.delete(`/gallery/${id}`),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: memoriesKey }),
    });
}
