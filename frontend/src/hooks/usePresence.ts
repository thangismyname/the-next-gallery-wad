// Bạn bè đang online (WS presence:*). Nghe 1 lần trong MainLayout
// (`usePresenceListener`), đọc ở mọi nơi qua `usePresence`.
import { useEffect } from "react";
import { create } from "zustand";
import { SIGNAL } from "@/services/signaling";
import { useSignaling } from "./useSignaling";

interface OnlineUser {
  userId: string;
  username: string;
  avatarUrl?: string | null;
}

interface PresenceState {
  online: Record<string, OnlineUser>;
  isOnline: (userId: string) => boolean;
}

export const usePresence = create<PresenceState>((_set, get) => ({
  online: {},
  isOnline: (userId) => Boolean(get().online[userId]),
}));

export function usePresenceListener() {
  const signaling = useSignaling();
  useEffect(() => {
    const offs = [
      signaling.on(SIGNAL.PRESENCE_SNAPSHOT, (payload) => {
        const list = Array.isArray(payload.online) ? (payload.online as OnlineUser[]) : [];
        usePresence.setState({ online: Object.fromEntries(list.map((u) => [u.userId, u])) });
      }),
      signaling.on(SIGNAL.PRESENCE_ONLINE, (payload) => {
        const user = payload.user as OnlineUser | undefined;
        if (user?.userId) usePresence.setState((s) => ({ online: { ...s.online, [user.userId]: user } }));
      }),
      signaling.on(SIGNAL.PRESENCE_OFFLINE, (payload) => {
        const userId = payload.userId as string | undefined;
        if (!userId) return;
        usePresence.setState((s) => {
          const online = { ...s.online };
          delete online[userId];
          return { online };
        });
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [signaling]);
}
