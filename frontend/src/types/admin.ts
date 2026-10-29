import { LayoutDashboard } from "lucide-react";

export type AdminRole = "user" | "admin";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: AdminRole;
  banned: boolean;
  banReason: string | null;
  emailVerified: boolean;
  createdAt: string;
  mediaCount: number;
  storageBytes: number;
  lastActiveAt: string | null;
}

export interface AdminOverview {
  kpi: {
    users: number;
    newUsers: number;
    photos: number;
    videos: number;
    storageBytes: number;
    pendingRequests: number;
  };
  /** 30 ngày gần nhất, đủ từng ngày. */
  activity: { date: string; signups: number; uploads: number }[];
  recentUsers: Pick<
    AdminUser,
    "id" | "name" | "email" | "image" | "role" | "createdAt"
  >[];
}

/** Tiến độ AI: số ảnh đã xử lý / tổng theo từng pipeline. */
export interface AiCoverage {
  total: number;
  done: { clip: number; yolo: number; tags: number; dino: number };
}

export interface AdminSystem {
  aiService: {
    online: boolean;
    providers: { clip: string | null; yolo: string | null; dino: string | null } | null;
    clipModel: string | null;
    tagModel: string | null;
  };
  coverage: AiCoverage;
}

export interface AdminUserDetail {
  user: AdminUser;
  stats: {
    photos: number;
    videos: number;
    trashed: number;
    storageBytes: number;
    albums: number;
    moments: number;
  };
  coverage: AiCoverage;
}

export type AdminUserSort =
  | "createdAt"
  | "name"
  | "mediaCount"
  | "storage"
  | "lastActive";

export interface AdminUserQuery {
  q?: string;
  role?: AdminRole;
  status?: "active" | "banned";
  sort: AdminUserSort;
  dir: "asc" | "desc";
  limit: number;
  offset: number;
}

export interface AdminNavItem {
  key: string;
  to: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
}
