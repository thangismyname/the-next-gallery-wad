import { momentInvitationsCountQueryKey } from "@tng/shared";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  Camera,
  Clock3,
  FolderOpen,
  Image,
  Send,
  ShieldCheck,
  SquareTerminal,
  Sparkles,
  Users,
} from "lucide-react";
import type { NavMenuItem } from "./types";
import { fetchFriendRequests } from "@/services/friends";
import { friendsKeys } from "@/features/friends/useFriends";
import { fetchMomentInvitationCount } from "@/services/moments";
import { useSession } from "@/services/authClient";
import { useDeveloperMode } from "@/hooks/useDeveloperMode";

/**
 * Mục điều hướng dùng chung cho Sidebar (desktop) và BottomBar (mobile).
 * Sidebar nhóm theo `section` (đúng thứ tự khai báo; về Trang chủ = header
 * của sidebar); BottomBar lấy các mục
 * có `bottomBar` và xếp theo số đó. Moment kèm số lời mời đang chờ (badge).
 */
export function useNavItems(): NavMenuItem[] {
  const { t } = useTranslation();
  // Badge = tổng số lời mời collab đang chờ (endpoint count, không tải list).
  const { data: momentBadge = 0 } = useQuery({
    queryKey: momentInvitationsCountQueryKey,
    queryFn: fetchMomentInvitationCount,
    staleTime: 30_000,
  });
  // Lời mời kết bạn đang chờ (cùng key với trang Bạn bè; WS friend:* làm mới).
  const { data: friendRequests } = useQuery({
    queryKey: friendsKeys.requests,
    queryFn: fetchFriendRequests,
    staleTime: 30_000,
  });
  const friendBadge = friendRequests?.length ?? 0;
  const isAdmin = useSession().data?.user.role === "admin";
  // Khu Developer: hiện khi Developer Mode đang bật (đã duyệt + công tắc bật); admin vào Lab qua sidebar admin.
  const { devModeEnabled } = useDeveloperMode();

  return useMemo(
    () => [
      // Ảnh của tôi (Yêu thích, nhãn, Thùng rác nằm trong Albums → /albums/favorites, /albums/trash vẫn sáng mục Albums)
      { label: t("sidebar.gallery"), icon: Image, to: "/gallery", section: "photos", bottomBar: 0 },
      { label: t("sidebar.albums"), icon: FolderOpen, to: "/albums", section: "photos", bottomBar: 1 },

      // AI
      { label: t("navigation.aiEdit"), icon: Sparkles, to: "/studio", section: "ai", bottomBar: 4 },
      { label: t("navigation.camera"), icon: Camera, to: "/camera", section: "ai", bottomBar: 2 },

      // Chia sẻ
      { label: t("sidebar.moments"), icon: Clock3, to: "/moments", section: "social", bottomBar: 3, badge: momentBadge },
      { label: t("sidebar.friends"), icon: Users, to: "/friends", section: "social", badge: friendBadge },
      { label: t("sidebar.share"), icon: Send, to: "/share", section: "social" },

      // Ghim đáy sidebar, chỉ admin (route /admin vẫn chặn bằng AdminRoute)
      ...(devModeEnabled ? [{ label: t("sidebar.developer"), icon: SquareTerminal, to: "/dev", section: "system" as const }] : []),
      ...(isAdmin ? [{ label: t("sidebar.admin"), icon: ShieldCheck, to: "/admin", section: "system" as const }] : []),

    ],
    [t, momentBadge, friendBadge, isAdmin, devModeEnabled],
  );
}

/** Mục đang mở: "/" phải khớp đúng, còn lại khớp cả trang con (/albums/abc). */
export function isNavActive(to: string, pathname: string) {
  return to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
}
