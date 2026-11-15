import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { momentMemesQueryKey, type MomentMeme, type MomentMemePage } from "@tng/shared";
import * as Haptics from "expo-haptics";
import { useCallback, useMemo } from "react";

import { momentsApi } from "@/services";

import { patchFeedMoment } from "./momentsCache";

const PAGE_SIZE = 20;
export const memeTemplatesQueryKey = ["moments", "memes", "templates"] as const;

/**
 * Memes of one moment (web `MomentMemePanel`): paged list (newest first, same
 * cache key as web), ❤️ toggle (optimistic), delete own, create from a memegen
 * template + text lines. Adding / removing keeps the feed's `memeCount` in step.
 */
export function useMomentMemes(momentId: string) {
  const queryClient = useQueryClient();
  const query = useInfiniteQuery<MomentMemePage>({
    queryKey: momentMemesQueryKey(momentId),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => momentsApi.fetchMomentMemes(momentId, pageParam as number, PAGE_SIZE),
    getNextPageParam: (last) => (last.hasMore ? last.offset + last.limit : undefined),
    enabled: !!momentId,
  });
  const memes = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);

  const patchMeme = useCallback(
    (memeId: string, updater: (m: MomentMeme) => MomentMeme | null) =>
      queryClient.setQueryData<InfiniteData<MomentMemePage>>(momentMemesQueryKey(momentId), (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((p) => ({
                ...p,
                items: p.items.flatMap((m) => {
                  if (m.id !== memeId) return [m];
                  const next = updater(m);
                  return next ? [next] : [];
                }),
              })),
            }
          : old,
      ),
    [queryClient, momentId],
  );
  const bumpCount = useCallback(
    (delta: number) =>
      patchFeedMoment(queryClient, momentId, (m) => ({ ...m, memeCount: Math.max(0, (m.memeCount ?? 0) + delta) })),
    [queryClient, momentId],
  );

  const toggleHeart = useCallback(
    async (meme: MomentMeme) => {
      void Haptics.selectionAsync();
      patchMeme(meme.id, (m) => ({ ...m, myReact: !m.myReact, reactCount: m.reactCount + (m.myReact ? -1 : 1) }));
      try {
        const res = await momentsApi.toggleMemeReaction(momentId, meme.id);
        patchMeme(meme.id, (m) => ({ ...m, myReact: res.myReact, reactCount: res.reactCount }));
      } catch {
        void queryClient.invalidateQueries({ queryKey: momentMemesQueryKey(momentId) });
      }
    },
    [momentId, patchMeme, queryClient],
  );

  const remove = useCallback(
    async (meme: MomentMeme) => {
      await momentsApi.deleteMomentMeme(momentId, meme.id);
      patchMeme(meme.id, () => null);
      bumpCount(-1);
    },
    [momentId, patchMeme, bumpCount],
  );

  const create = useCallback(
    async (templateId: string, lines: string[]) => {
      await momentsApi.createMomentMeme(momentId, { templateId, lines });
      bumpCount(1);
      await queryClient.invalidateQueries({ queryKey: momentMemesQueryKey(momentId) });
    },
    [momentId, bumpCount, queryClient],
  );

  return { ...query, memes, toggleHeart, remove, create };
}

/** memegen.link templates (cached by the backend for 6 h). */
export function useMemeTemplates(enabled: boolean) {
  return useQuery({
    queryKey: memeTemplatesQueryKey,
    queryFn: momentsApi.fetchMemeTemplates,
    staleTime: 60 * 60_000,
    enabled,
  });
}
