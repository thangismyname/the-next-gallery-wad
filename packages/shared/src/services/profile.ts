import type { HttpClient } from "../http";

export interface ProfileStats {
  photos: number;
  videos: number;
  favorites: number;
  storageBytes: number;
  friends: number;
  moments: number;
}

export const profileStatsQueryKey = ["profile", "stats"] as const;

export interface StorageBreakdown {
  photoBytes: number;
  videoBytes: number;
  trashBytes: number;
  trashCount: number;
}

export const storageQueryKey = ["profile", "storage"] as const;

export const createProfileService = (http: HttpClient) => ({
  fetchProfileStats: (): Promise<ProfileStats> =>
    http.get<ProfileStats>("/profile/stats"),

  fetchStorageBreakdown: (): Promise<StorageBreakdown> =>
    http.get<StorageBreakdown>("/profile/storage"),
});
