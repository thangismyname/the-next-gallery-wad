import { request } from "@/services/http";
import { mapMediaItem, resolveMediaUrl, type MediaListItem } from "@/services/media";

/** Key màu — khớp backend labels.constants.js::LABEL_COLORS. */
export const LABEL_COLORS = ["slate", "rose", "amber", "emerald", "sky", "violet"] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];

/** Nhãn từ API: nhãn gợi ý chưa đổi tên có `name = null` + `preset` (key i18n). */
export interface UserLabelDto {
  id: string;
  name: string | null;
  /** edit | print | family… → favorites.labels.suggested.<preset>. */
  preset: string | null;
  color: LabelColor;
  position: number;
  /** Số ảnh (không tính thùng rác). */
  count: number;
  coverUrl: string | null;
}

/** Nhãn đã có tên hiển thị theo ngôn ngữ đang dùng (features/favorites/useLabels). */
export interface UserLabel extends UserLabelDto {
  name: string;
  /** Nhãn gợi ý chưa đổi tên — tên dịch theo ngôn ngữ. */
  suggested: boolean;
}

/** all = có tim HOẶC có nhãn · favorites = chỉ có tim · còn lại = id nhãn. */
export type SavedFilter = "all" | "favorites" | (string & {});

export interface SavedMediaItem extends MediaListItem {
  labelIds: string[];
}

export const labelsQueryKey = ["labels"] as const;
export const mediaLabelsQueryKey = (mediaId: string) => ["labels", "media", mediaId] as const;
export const savedQueryKey = (filter: SavedFilter) => ["favorites", filter] as const;

const mapLabel = (label: UserLabelDto): UserLabelDto => ({
  ...label,
  coverUrl: label.coverUrl ? resolveMediaUrl(label.coverUrl) : null,
});

export interface LabelList {
  seeded: boolean;
  /** all = có tim hoặc có nhãn · favorites = có tim. */
  totals: { all: number; favorites: number };
  labels: UserLabelDto[];
}

const mapList = (data: LabelList): LabelList => ({ ...data, labels: data.labels.map(mapLabel) });

export const fetchLabels = async () => mapList(await request<LabelList>("/labels"));

/** Tạo 3 nhãn gợi ý (chỉ có tác dụng lần đầu của mỗi tài khoản). */
export const seedLabels = async () =>
  mapList(await request<LabelList>("/labels/seed", { method: "POST" }));

export const createLabel = (body: { name: string; color: LabelColor }) =>
  request<UserLabelDto>("/labels", { method: "POST", body: JSON.stringify(body) });

export const updateLabel = (id: string, body: { name?: string; color?: LabelColor }) =>
  request<UserLabelDto>(`/labels/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const deleteLabel = (id: string) => request<null>(`/labels/${id}`, { method: "DELETE" });

export const setLabelMedia = (id: string, mediaIds: string[], labeled: boolean) =>
  request<unknown>(`/labels/${id}/media${labeled ? "" : "/remove"}`, {
    method: "POST",
    body: JSON.stringify({ mediaIds }),
  });

/** Nhãn của 1 ảnh — `editable` false = ảnh người khác / trong thùng rác. */
export const fetchMediaLabels = (mediaId: string) =>
  request<{ editable: boolean; labelIds: string[] }>(`/labels/media/${mediaId}`);

export const fetchSaved = async (filter: SavedFilter, offset = 0, limit = 1000) => {
  const params = new URLSearchParams({ filter, offset: String(offset), limit: String(limit) });
  const data = await request<{ total: number; items: Record<string, unknown>[] }>(
    `/labels/saved?${params}`,
  );
  return {
    total: data.total,
    items: data.items.map(
      (item): SavedMediaItem => ({
        ...mapMediaItem(item),
        labelIds: Array.isArray(item.labelIds) ? (item.labelIds as string[]) : [],
      }),
    ),
  };
};
