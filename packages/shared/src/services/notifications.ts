// Saved notifications (backend `modules/notifications`) — web + mobile.
import type { HttpClient } from "../http";
import { resolveMediaUrl } from "./media";

export type AppNotificationType = "moment_deleted" | "moment_declined";

export interface AppNotification {
  id: string;
  type: AppNotificationType | string;
  /** moment_deleted: { momentId, template, caption }. */
  payload: Record<string, unknown>;
  createdAt: string;
  /** Who caused it (null = account deleted). */
  actor: { id: string; name: string; image: string | null } | null;
}

export const notificationsQueryKey = ["notifications"] as const;

/** i18n key + params of a notification's sentence (web list / toast, mobile inbox). */
export function notificationMessage(
  n: { type: string; payload?: Record<string, unknown> | null },
  name: string,
): [key: string, params: Record<string, string>] {
  const caption = typeof n.payload?.caption === "string" ? n.payload.caption : "";
  if (n.type === "moment_deleted" || n.type === "moment_declined") {
    const base = n.type === "moment_deleted" ? "notifications.momentDeleted" : "notifications.momentDeclined";
    return caption ? [`${base}Caption`, { name, caption }] : [base, { name }];
  }
  return ["notifications.generic", { name }];
}

export const createNotificationsService = (http: HttpClient) => ({
  listNotifications: async (): Promise<AppNotification[]> => {
    const data = await http.get<{ items?: AppNotification[] }>("/notifications");
    return (data?.items ?? []).map((n) => ({
      ...n,
      actor: n.actor ? { ...n.actor, image: n.actor.image ? resolveMediaUrl(n.actor.image) : null } : null,
    }));
  },
  deleteNotification: (id: string) => http.del<{ removed: boolean }>(`/notifications/${encodeURIComponent(id)}`),
  clearNotifications: () => http.del<{ removed: number }>("/notifications"),
});
