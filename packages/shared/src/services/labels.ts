import type { HttpClient } from "../http";
import { mapMediaItem, resolveMediaUrl, type MediaListItem } from "./media";

export const LABEL_COLORS = ["slate", "rose", "amber", "emerald", "sky", "violet"] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];

export interface UserLabelDto {
  id: string;
  name: string | null;
  preset: string | null;
  color: LabelColor;
  position: number;
  count: number;
  coverUrl: string | null;
}

export interface UserLabel extends UserLabelDto {
  name: string;
  suggested: boolean;
}

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
  totals: { all: number; favorites: number };
  labels: UserLabelDto[];
}

const mapList = (data: LabelList): LabelList => ({
  ...data,
  labels: (data.labels ?? []).map(mapLabel),
});

export const createLabelsService = (http: HttpClient) => ({
  fetchLabels: async (): Promise<LabelList> =>
    mapList(await http.get<LabelList>("/labels")),

  seedLabels: async (): Promise<LabelList> =>
    mapList(await http.post<LabelList>("/labels/seed")),

  createLabel: (body: { name: string; color: LabelColor }): Promise<UserLabelDto> =>
    http.post<UserLabelDto>("/labels", body),

  updateLabel: (id: string, body: { name?: string; color?: LabelColor }): Promise<UserLabelDto> =>
    http.patch<UserLabelDto>(`/labels/${encodeURIComponent(id)}`, body),

  deleteLabel: (id: string): Promise<null> =>
    http.del<null>(`/labels/${encodeURIComponent(id)}`),

  setLabelMedia: (id: string, mediaIds: string[], labeled: boolean): Promise<unknown> =>
    http.post<unknown>(`/labels/${id}/media${labeled ? "" : "/remove"}`, {
      mediaIds,
    }),

  fetchMediaLabels: (mediaId: string): Promise<{ editable: boolean; labelIds: string[] }> =>
    http.get<{ editable: boolean; labelIds: string[] }>(`/labels/media/${encodeURIComponent(mediaId)}`),

  fetchSaved: async (
    filter: SavedFilter,
    offset = 0,
    limit = 1000,
  ): Promise<{ total: number; items: SavedMediaItem[] }> => {
    const data = await http.get<{ total: number; items: Record<string, unknown>[] }>(
      `/labels/saved`,
      { params: { filter, offset, limit } },
    );
    return {
      total: data.total,
      items: (Array.isArray(data.items) ? data.items : []).map(
        (item): SavedMediaItem => ({
          ...mapMediaItem(item),
          labelIds: Array.isArray(item.labelIds) ? (item.labelIds as string[]) : [],
        }),
      ),
    };
  },
});
