import type { HttpClient } from "../http";
import type {
  MemeTemplate,
  Moment,
  MomentFraming,
  MomentMeme,
  MomentReaction,
  MomentSlot,
  MomentTemplate,
  MomentVisibility,
  ReactPayload,
} from "../types";
import { resolveMediaUrl } from "./media";

export interface MomentPage {
  items: Moment[];
  hasMore: boolean;
  limit: number;
  offset: number;
}

export type MomentInvitationPage = MomentPage;

function mapSlot(item: Record<string, unknown>): MomentSlot {
  const mediaId = item.mediaId as string | null;
  return {
    slotIndex: Number(item.slotIndex) || 0,
    userId: item.userId as string,
    userName: (item.userName as string) ?? "Unknown",
    userAvatarUrl:
      typeof item.userAvatarUrl === "string"
        ? resolveMediaUrl(item.userAvatarUrl)
        : null,
    mediaId,
    mediaType: (item.mediaType as MomentSlot["mediaType"]) ?? "photo",
    thumbnailUrl: mediaId ? resolveMediaUrl(item.thumbnailUrl as string) : null,
    displayUrl: mediaId && item.displayUrl ? resolveMediaUrl(item.displayUrl as string) : null,
    framing: (item.framing as MomentFraming | null) ?? null,
    url: mediaId ? resolveMediaUrl(item.url as string) : null,
    width: (item.width as number) ?? 800,
    height: (item.height as number) ?? 600,
    durationSeconds: (item.durationSeconds as number | null) ?? null,
    filled: Boolean(item.filled),
    declined: Boolean(item.declined),
    missing: Boolean(item.missing),
    filledAt: (item.filledAt as string | null) ?? null,
  };
}

function mapMoment(item: Record<string, unknown>): Moment {
  return {
    id: item.id as string,
    userId: item.userId as string,
    userName: (item.userName as string) ?? "Unknown",
    userAvatarUrl: item.userAvatarUrl
      ? resolveMediaUrl(item.userAvatarUrl as string)
      : null,
    template: (item.template as MomentTemplate) ?? "single",
    slots: (Array.isArray(item.slots) ? item.slots : []).map((s) =>
      mapSlot(s as Record<string, unknown>),
    ),
    mediaId: (item.mediaId as string | null) ?? null,
    mediaType: (item.mediaType as Moment["mediaType"]) ?? "photo",
    caption: (item.caption as string | null) ?? null,
    framing: (item.framing as MomentFraming | null) ?? null,
    visibility: item.visibility as MomentVisibility | undefined,
    missingMedia: Boolean(item.missingMedia),
    thumbnailUrl: item.thumbnailUrl
      ? resolveMediaUrl(item.thumbnailUrl as string)
      : null,
    displayUrl: item.displayUrl
      ? resolveMediaUrl(item.displayUrl as string)
      : null,
    thumbSmallUrl: item.thumbSmallUrl
      ? resolveMediaUrl(item.thumbSmallUrl as string)
      : null,
    url: item.url ? resolveMediaUrl(item.url as string) : null,
    width: (item.width as number) ?? 800,
    height: (item.height as number) ?? 600,
    durationSeconds: (item.durationSeconds as number | null) ?? null,
    createdAt: item.createdAt as string,
    isOwn: Boolean(item.isOwn),
    isParticipant: Boolean(item.isParticipant),
    reactions: (Array.isArray(item.reactions) ? item.reactions : []).map(
      (r: Record<string, unknown>): MomentReaction => ({
        emoji: r.emoji as string,
        count: Number(r.count) || 0,
      }),
    ),
    myReaction:
      typeof item.myReaction === "string" && item.myReaction.length > 0
        ? item.myReaction
        : null,
    recentReactions: (Array.isArray(item.recentReactions)
      ? item.recentReactions
      : []
    ).map(
      (r: Record<string, unknown>): Moment["recentReactions"][number] => ({
        emoji:
          typeof r.emoji === "string" && r.emoji.length > 0 ? r.emoji : null,
        userId: r.userId as string,
        userName: r.userName as string,
        userAvatarUrl:
          typeof r.userAvatarUrl === "string" ? r.userAvatarUrl : null,
      }),
    ),
    myPendingSlot:
      typeof item.myPendingSlot === "number" ? item.myPendingSlot : null,
    myPendingSlots: Array.isArray(item.myPendingSlots)
      ? item.myPendingSlots.map((n) => Number(n))
      : typeof item.myPendingSlot === "number"
        ? [item.myPendingSlot]
        : [],
    pendingCount: Number(item.pendingCount) || 0,
    memeCount: Number(item.memeCount) || 0,
  };
}

function mapMeme(item: Record<string, unknown>): MomentMeme {
  return {
    id: item.id as string,
    momentId: item.momentId as string,
    userId: item.userId as string,
    userName: (item.userName as string) ?? "Unknown",
    userAvatarUrl:
      typeof item.userAvatarUrl === "string" ? item.userAvatarUrl : null,
    imageUrl: resolveMediaUrl(item.imageUrl as string),
    templateId:
      typeof item.templateId === "string" && item.templateId.length > 0
        ? item.templateId
        : null,
    caption:
      typeof item.caption === "string" && item.caption.length > 0
        ? item.caption
        : null,
    createdAt: item.createdAt as string,
    isOwn: Boolean(item.isOwn),
    reactCount: Number(item.reactCount) || 0,
    myReact: Boolean(item.myReact),
    reactNames: Array.isArray(item.reactNames)
      ? item.reactNames.map((n) => String(n))
      : [],
  };
}

export const createMomentsService = (http: HttpClient) => ({
  fetchMoments: async (
    options: { offset?: number; limit?: number } = {},
  ): Promise<MomentPage> => {
    const { offset = 0, limit = 60 } = options;
    const data = await http.get<{
      items?: Record<string, unknown>[];
      hasMore?: boolean;
      limit?: number;
      offset?: number;
    }>("/moments", { params: { offset, limit } });
    return {
      items: (Array.isArray(data?.items) ? data.items : []).map(mapMoment),
      hasMore: Boolean(data?.hasMore),
      limit: data?.limit ?? limit,
      offset: data?.offset ?? offset,
    };
  },

  createMoment: async (payload: {
    template?: MomentTemplate;
    mediaId?: string | null;
    mediaIds?: string[];
    /** framings[i] goes with my i-th photo (single: [0]); null = centered. */
    framings?: (MomentFraming | null)[];
    /** creatorSlots[i] = slot of my i-th photo (collab); omitted = the first slots. */
    creatorSlots?: number[];
    collaboratorIds?: string[];
    caption?: string;
    visibility?: MomentVisibility;
  }): Promise<Moment> => {
    const data = await http.post<Record<string, unknown>>("/moments", payload);
    return mapMoment((data ?? {}) as Record<string, unknown>);
  },

  fillMomentSlots: async (
    momentId: string,
    mediaIds: string[],
    /** framings[i] goes with mediaIds[i]; null = centred. */
    framings?: (MomentFraming | null)[],
    /** slotIndexes[i] = which of my empty slots gets mediaIds[i]; omitted = in order. */
    slotIndexes?: number[],
  ): Promise<{ filled: number; complete: boolean; moment: Moment }> => {
    const data = await http.post<{
      filled?: number;
      complete?: boolean;
      moment?: Record<string, unknown>;
    }>(`/moments/${encodeURIComponent(momentId)}/fill`, { mediaIds, framings, slotIndexes });
    return {
      filled: Number(data?.filled) || 0,
      complete: Boolean(data?.complete),
      moment: mapMoment((data?.moment ?? {}) as Record<string, unknown>),
    };
  },

  updateDraftMoment: async (
    momentId: string,
    payload: {
      template?: MomentTemplate;
      mediaIds?: string[];
      framings?: (MomentFraming | null)[];
      creatorSlots?: number[];
      collaboratorIds?: string[];
      caption?: string;
      visibility?: MomentVisibility;
    },
  ): Promise<Moment> => {
    const data = await http.put<Record<string, unknown>>(
      `/moments/${encodeURIComponent(momentId)}`,
      payload,
    );
    return mapMoment((data ?? {}) as Record<string, unknown>);
  },

  fetchMomentInvitations: async (
    options: { offset?: number; limit?: number } = {},
  ): Promise<MomentInvitationPage> => {
    const { offset = 0, limit = 20 } = options;
    const data = await http.get<{
      items?: Record<string, unknown>[];
      hasMore?: boolean;
      limit?: number;
      offset?: number;
    }>("/moments/invitations", { params: { offset, limit } });
    return {
      items: (Array.isArray(data?.items) ? data.items : []).map(mapMoment),
      hasMore: Boolean(data?.hasMore),
      limit: data?.limit ?? limit,
      offset: data?.offset ?? offset,
    };
  },

  fetchMomentInvitationCount: async (): Promise<number> => {
    const data = await http.get<{ count?: number }>("/moments/invitations/count");
    return Number(data?.count) || 0;
  },

  patchMoment: async (
    momentId: string,
    payload: { caption?: string | null; visibility?: MomentVisibility },
  ): Promise<Moment> => {
    const data = await http.patch<Record<string, unknown>>(
      `/moments/${encodeURIComponent(momentId)}`,
      payload,
    );
    return mapMoment((data ?? {}) as Record<string, unknown>);
  },

  deleteMoment: (momentId: string): Promise<void> =>
    http.del<void>(`/moments/${encodeURIComponent(momentId)}`),

  /** Invitee says no: their empty frames are marked declined, the creator gets a notification. */
  declineMoment: (momentId: string) =>
    http.post<{ declined: boolean }>(`/moments/${encodeURIComponent(momentId)}/decline`),

  leaveMoment: async (momentId: string): Promise<Moment> => {
    const data = await http.post<Record<string, unknown>>(
      `/moments/${encodeURIComponent(momentId)}/leave`,
    );
    return mapMoment((data ?? {}) as Record<string, unknown>);
  },

  reactToMoment: async (
    momentId: string,
    payload: ReactPayload,
  ): Promise<{ reacted: boolean; emoji: string | null }> => {
    const data = await http.post<{ reacted?: boolean; emoji?: string | null }>(
      `/moments/${encodeURIComponent(momentId)}/reactions`,
      payload,
    );
    return {
      reacted: data?.reacted ?? true,
      emoji: data?.emoji ?? null,
    };
  },

  removeMomentReaction: (momentId: string): Promise<void> =>
    http.del<void>(`/moments/${encodeURIComponent(momentId)}/reactions`),

  fetchMemeTemplates: async (): Promise<MemeTemplate[]> => {
    const data = await http.get<{ items?: Record<string, unknown>[] }>(
      "/moments/memes/templates",
    );
    const seen = new Set<string>();
    return (Array.isArray(data?.items) ? data.items : []).flatMap(
      (item: Record<string, unknown>): MemeTemplate[] => {
        const id = item.id as string;
        if (seen.has(id)) return [];
        seen.add(id);
        return [
          {
            id,
            name: (item.name as string) ?? id,
            lines: Number(item.lines) || 2,
            blankUrl: (item.blankUrl as string) ?? "",
          },
        ];
      },
    );
  },

  fetchMomentMemes: async (
    momentId: string,
    offset = 0,
    limit = 20,
  ): Promise<MomentMemePage> => {
    const data = await http.get<{
      items?: Record<string, unknown>[];
      hasMore?: boolean;
      limit?: number;
      offset?: number;
    }>(`/moments/${encodeURIComponent(momentId)}/memes`, {
      params: { offset, limit },
    });
    return {
      items: (Array.isArray(data?.items) ? data.items : []).map(mapMeme),
      hasMore: Boolean(data?.hasMore),
      limit: data?.limit ?? limit,
      offset: data?.offset ?? offset,
    };
  },

  createMomentMeme: async (
    momentId: string,
    payload: { templateId: string; lines: string[]; caption?: string },
  ): Promise<MomentMeme> => {
    const data = await http.post<Record<string, unknown>>(
      `/moments/${encodeURIComponent(momentId)}/memes`,
      payload,
    );
    return mapMeme((data ?? {}) as Record<string, unknown>);
  },

  deleteMomentMeme: (momentId: string, memeId: string): Promise<void> =>
    http.del<void>(
      `/moments/${encodeURIComponent(momentId)}/memes/${encodeURIComponent(memeId)}`,
    ),

  toggleMemeReaction: async (
    momentId: string,
    memeId: string,
  ): Promise<{ myReact: boolean; reactCount: number }> => {
    const data = await http.post<{ myReact?: boolean; reactCount?: number }>(
      `/moments/${encodeURIComponent(momentId)}/memes/${encodeURIComponent(memeId)}/react`,
    );
    return {
      myReact: data?.myReact ?? true,
      reactCount: data?.reactCount ?? 1,
    };
  },
});

export const momentsFeedQueryKey = ["moments", "feed"] as const;
export const momentInvitationsQueryKey = ["moments", "invitations"] as const;
export const momentInvitationsCountQueryKey = [
  "moments",
  "invitations",
  "count",
] as const;

export const momentMemesQueryKey = (momentId: string) =>
  ["moments", momentId, "memes"] as const;

export interface MomentMemePage {
  items: MomentMeme[];
  hasMore: boolean;
  limit: number;
  offset: number;
}
