import { API_URL } from "@/lib/config";

export interface ProfileStats {
  photos: number;
  videos: number;
  favorites: number;
  storageBytes: number;
  friends: number;
  moments: number;
}

export const profileStatsQueryKey = ["profile", "stats"] as const;

export async function fetchProfileStats(): Promise<ProfileStats> {
  const res = await fetch(`${API_URL}/profile/stats`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  const json = await res.json();
  return (json.data ?? json) as ProfileStats;
}

export interface StorageBreakdown {
  photoBytes: number;
  videoBytes: number;
  trashBytes: number;
  trashCount: number;
}

export const storageQueryKey = ["profile", "storage"] as const;

export async function fetchStorageBreakdown(): Promise<StorageBreakdown> {
  const res = await fetch(`${API_URL}/profile/storage`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  const json = await res.json();
  return (json.data ?? json) as StorageBreakdown;
}
