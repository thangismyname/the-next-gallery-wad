import {
  MemeTemplate,
  Moment,
  MomentMeme,
  MomentReaction,
  MomentSlot,
  MomentTemplate,
  MomentVisibility,
  ReactPayload,
} from "@/types";
import { API_URL as BASE_URL } from "@/lib/config";
import { resolveMediaUrl } from "@/services/media";

export interface MomentPage {
  items: Moment[];
  hasMore: boolean;
  limit: number;
  offset: number;
}

function mapSlot(item: Record<string, unknown>): MomentSlot {
  const mediaId = item.mediaId as string | null;
  return {
    slotIndex: Number(item.slotIndex) || 0,
    userId: item.userId as string,
    userName: (item.userName as string) ?? "Unknown",
    userAvatarUrl: typeof item.userAvatarUrl === "string"
      ? resolveMediaUrl(item.userAvatarUrl)
      : null,
    mediaId,
    mediaType: (item.mediaType as MomentSlot["mediaType"]) ?? "photo",
    thumbnailUrl: mediaId ? resolveMediaUrl(item.thumbnailUrl as string) : null,
    url: mediaId ? resolveMediaUrl(item.url as string) : null,
    width: (item.width as number) ?? 800,
    height: (item.height as number) ?? 600,
    durationSeconds: (item.durationSeconds as number | null) ?? null,
    filled: Boolean(item.filled),
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
    visibility: item.visibility as MomentVisibility | undefined,
    thumbnailUrl: item.thumbnailUrl
      ? resolveMediaUrl(item.thumbnailUrl as string)
      : null,
    url: item.url ? resolveMediaUrl(item.url as string) : null,
    width: (item.width as number) ?? 800,
    height: (item.height as number) ?? 600,
    durationSeconds: (item.durationSeconds as number | null) ?? null,
    createdAt: item.createdAt as string,
    isOwn: Boolean(item.isOwn),
    isParticipant: Boolean(item.isParticipant),
    reactions: (Array.isArray(item.reactions)
      ? item.reactions
      : []
    ).map(
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
    imageUrl: item.imageUrl as string,
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

export const fetchMoments = async (
  offset = 0,
  limit = 60,
): Promise<MomentPage> => {
  const response = await fetch(
    `${BASE_URL}/moments?offset=${offset}&limit=${limit}`,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const json = await response.json();
  const data = json.data ?? json;

  const items: Moment[] = (
    Array.isArray(data.items) ? data.items : []
  ).map((item: Record<string, unknown>) => mapMoment(item));

  return {
    items,
    hasMore: Boolean(data.hasMore),
    limit: data.limit ?? limit,
    offset: data.offset ?? offset,
  };
};

export const createMoment = async (payload: {
  template?: MomentTemplate;
  /** single: 1 ảnh. collab (duo/trio): ảnh của creator cho slot 0. */
  mediaId?: string | null;
  /** self-fill (duo/trio): đủ ảnh bằng số slot. */
  mediaIds?: string[];
  /** collab: bạn bè điền các slot còn lại. */
  collaboratorIds?: string[];
  caption?: string;
  visibility?: MomentVisibility;
}): Promise<Moment> => {
  const response = await fetch(`${BASE_URL}/moments`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const json = await response.json().catch(() => null);
    const message =
      json?.error?.message ?? `HTTP error! status: ${response.status}`;
    throw new Error(message);
  }

  const json = await response.json();
  return mapMoment((json.data as Record<string, unknown>) ?? {});
};

// Điền ảnh vào các slot trống của mình trong draft moment collab.
// mediaIds: 1+ ảnh — lấp tuần tự các slot (1 người giữ nhiều slot thì gửi nhiều ảnh).
export const fillMomentSlots = async (
  momentId: string,
  mediaIds: string[],
): Promise<{ filled: number; complete: boolean; moment: Moment }> => {
  const response = await fetch(`${BASE_URL}/moments/${momentId}/fill`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mediaIds }),
  });

  if (!response.ok) {
    const json = await response.json().catch(() => null);
    const message =
      json?.error?.message ?? `HTTP error! status: ${response.status}`;
    throw new Error(message);
  }

  const json = await response.json();
  return {
    filled: Number(json.data?.filled) || 0,
    complete: Boolean(json.data?.complete),
    moment: mapMoment((json.data?.moment as Record<string, unknown>) ?? {}),
  };
};

// Chỉnh sửa draft moment collab của chính mình (chưa đủ slot) — quay lại edit trước khi đăng.
export const updateDraftMoment = async (
  momentId: string,
  payload: {
    template?: MomentTemplate;
    /** ảnh (1..slotCount-1) của creator chiếm các slot đầu. */
    mediaIds?: string[];
    /** bạn bè điền các slot còn lại. */
    collaboratorIds?: string[];
    caption?: string;
    visibility?: MomentVisibility;
  },
): Promise<Moment> => {
  const response = await fetch(`${BASE_URL}/moments/${momentId}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const json = await response.json().catch(() => null);
    const message =
      json?.error?.message ?? `HTTP error! status: ${response.status}`;
    throw new Error(message);
  }

  const json = await response.json();
  return mapMoment((json.data as Record<string, unknown>) ?? {});
};

// Draft moment collab mà tôi được mời điền ảnh / đang chờ bạn.
export const fetchMomentInvitations = async (): Promise<Moment[]> => {
  const response = await fetch(`${BASE_URL}/moments/invitations`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const json = await response.json();
  const data = json.data ?? json;
  return (Array.isArray(data.items) ? data.items : []).map((item: Record<string, unknown>) =>
    mapMoment(item),
  );
};

export const deleteMoment = async (momentId: string): Promise<void> => {
  const response = await fetch(`${BASE_URL}/moments/${momentId}`, {
    method: "DELETE",
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
};

// Người được mời gỡ ảnh của mình khỏi moment collab
// (moment quay về trạng thái chưa đủ slot cho creator điều chỉnh lại).
export const leaveMoment = async (
  momentId: string,
): Promise<Moment> => {
  const response = await fetch(`${BASE_URL}/moments/${momentId}/leave`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const json = await response.json().catch(() => null);
    const message =
      json?.error?.message ?? `HTTP error! status: ${response.status}`;
    throw new Error(message);
  }

  const json = await response.json();
  return mapMoment((json.data as Record<string, unknown>) ?? {});
};

// ---- Reactions ----

// React 1 moment bằng emoji.
export const reactToMoment = async (
  momentId: string,
  payload: ReactPayload,
): Promise<{ reacted: boolean; emoji: string | null }> => {
  const response = await fetch(`${BASE_URL}/moments/${momentId}/reactions`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const json = await response.json().catch(() => null);
    const message =
      json?.error?.message ?? `HTTP error! status: ${response.status}`;
    throw new Error(message);
  }

  const json = await response.json();
  return (json.data as { reacted: boolean; emoji: string | null }) ?? {
    reacted: true,
    emoji: null,
  };
};

export const removeMomentReaction = async (momentId: string): Promise<void> => {
  const response = await fetch(`${BASE_URL}/moments/${momentId}/reactions`, {
    method: "DELETE",
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const json = await response.json().catch(() => null);
    const message =
      json?.error?.message ?? `HTTP error! status: ${response.status}`;
    throw new Error(message);
  }
};

/** Query key của feed moments + danh sách lời mời collab. */
export const momentsFeedQueryKey = ["moments", "feed"] as const;
export const momentInvitationsQueryKey = ["moments", "invitations"] as const;

// ================= Memes (mặt sau thẻ moment khi lật) =================

/** Query key của list meme 1 moment (["moments", momentId, "memes"]). */
export const momentMemesQueryKey = (momentId: string) =>
  ["moments", momentId, "memes"] as const;

export interface MomentMemePage {
  items: MomentMeme[];
  hasMore: boolean;
  limit: number;
  offset: number;
}

// Template meme từ memegen.link — dùng cho picker tạo meme.
export const fetchMemeTemplates = async (): Promise<MemeTemplate[]> => {
  const response = await fetch(`${BASE_URL}/moments/memes/templates`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const json = await response.json();
  const data = json.data ?? json;
  const seen = new Set<string>();
  return (Array.isArray(data.items) ? data.items : []).flatMap(
    (item: Record<string, unknown>): MemeTemplate[] => {
      // memegen có template trùng id → dedupe giữ bản đầu để key React unique.
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
};

// List meme của 1 moment — mới → cũ, phân trang cho scroll vô hạn.
export const fetchMomentMemes = async (
  momentId: string,
  offset = 0,
  limit = 20,
): Promise<MomentMemePage> => {
  const response = await fetch(
    `${BASE_URL}/moments/${momentId}/memes?offset=${offset}&limit=${limit}`,
    { credentials: "include", headers: { Accept: "application/json" } },
  );
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const json = await response.json();
  const data = json.data ?? json;
  return {
    items: (Array.isArray(data.items) ? data.items : []).map((m: Record<string, unknown>) =>
      mapMeme(m),
    ),
    hasMore: Boolean(data.hasMore),
    limit: data.limit ?? limit,
    offset: data.offset ?? offset,
  };
};

// Thả meme: chọn template + dòng chữ → backend render memegen.link → lưu.
export const createMomentMeme = async (
  momentId: string,
  payload: { templateId: string; lines: string[]; caption?: string },
): Promise<MomentMeme> => {
  const response = await fetch(`${BASE_URL}/moments/${momentId}/memes`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const json = await response.json().catch(() => null);
    const message =
      json?.error?.message ?? `HTTP error! status: ${response.status}`;
    throw new Error(message);
  }
  const json = await response.json();
  return mapMeme((json.data as Record<string, unknown>) ?? {});
};

// Xóa meme của chính mình.
export const deleteMomentMeme = async (
  momentId: string,
  memeId: string,
): Promise<void> => {
  const response = await fetch(
    `${BASE_URL}/moments/${momentId}/memes/${memeId}`,
    {
      method: "DELETE",
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );
  if (!response.ok) {
    const json = await response.json().catch(() => null);
    const message =
      json?.error?.message ?? `HTTP error! status: ${response.status}`;
    throw new Error(message);
  }
};

// Tim (❤️) 1 meme — toggle. Trả trạng thái mới để cập nhật optimistic.
export const toggleMemeReaction = async (
  momentId: string,
  memeId: string,
): Promise<{ myReact: boolean; reactCount: number }> => {
  const response = await fetch(
    `${BASE_URL}/moments/${momentId}/memes/${memeId}/react`,
    {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );
  if (!response.ok) {
    const json = await response.json().catch(() => null);
    const message =
      json?.error?.message ?? `HTTP error! status: ${response.status}`;
    throw new Error(message);
  }
  const json = await response.json();
  return (json.data as { myReact: boolean; reactCount: number }) ?? {
    myReact: true,
    reactCount: 1,
  };
};