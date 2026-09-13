import type { QueryClient } from '@tanstack/react-query';

import { bucketQuery, lettersQuery, questionQuery, storyQuery, todayQuery } from '../hooks/useChamber';
import { conversationsQuery } from '../hooks/useConversations';
import { memoriesQuery } from '../hooks/useMemories';

/**
 * Loads every screen's data the moment she enters, so a tab opened later
 * already has something to show instead of a placeholder.
 *
 * A conversation's messages are not included: they depend on which person is
 * opened. prefetchQuery never throws — a screen whose prefetch failed simply
 * fetches again when it is opened.
 */
export async function prefetchChamber(queryClient: QueryClient): Promise<void> {
    await Promise.all([
        queryClient.prefetchQuery(todayQuery()),
        queryClient.prefetchQuery(questionQuery()),
        queryClient.prefetchQuery(conversationsQuery()),
        queryClient.prefetchQuery(memoriesQuery()),
        queryClient.prefetchQuery(lettersQuery()),
        queryClient.prefetchQuery(storyQuery()),
        queryClient.prefetchQuery(bucketQuery()),
    ]);
}
