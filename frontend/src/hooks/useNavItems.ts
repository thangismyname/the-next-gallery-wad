import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  Camera,
  Clock3,
  FolderOpen,
  Heart,
  Image,
  Send,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { NavMenuItem } from "@/types";
import {
  fetchMomentInvitations,
  momentInvitationsQueryKey,
} from "@/services/moments";

/**
 * Mục điều hướng dùng chung cho Sidebar (desktop) và BottomBar (mobile).
 * Sidebar nhóm theo `section` (đúng thứ tự khai báo; về Trang chủ = header
 * của sidebar); BottomBar lấy các mục
 * có `bottomBar` và xếp theo số đó. Moment kèm số lời mời đang chờ (badge).
 */
export function useNavItems(): NavMenuItem[] {
  const { t } = useTranslation();
  const { data: invitations } = useQuery({
    queryKey: momentInvitationsQueryKey,
    queryFn: fetchMomentInvitations,
    staleTime: 30_000,
  });
  const momentBadge = invitations?.length ?? 0;

  return useMemo(
    () => [
      // Ảnh của tôi
      { label: t("sidebar.gallery"), icon: Image, to: "/gallery", section: "photos", bottomBar: 0 },
      { label: t("sidebar.favorites"), icon: Heart, to: "/favorites", section: "photos" },
      { label: t("sidebar.albums"), icon: FolderOpen, to: "/albums", section: "photos", bottomBar: 1 },

      // AI
      { label: t("navigation.aiEdit"), icon: Sparkles, to: "/studio", section: "ai", bottomBar: 4 },
      { label: t("navigation.capture"), icon: Camera, to: "/capture", section: "ai", bottomBar: 2 },

      // Chia sẻ
      { label: t("sidebar.moments"), icon: Clock3, to: "/moments", section: "social", bottomBar: 3, badge: momentBadge },
      { label: t("sidebar.friends"), icon: Users, to: "/friends", section: "social" },
      { label: t("sidebar.share"), icon: Send, to: "/share", section: "social" },

      // Ghim dưới cùng sidebar
      { label: t("sidebar.trash"), icon: Trash2, to: "/trash", section: "system" },
    ],
    [t, momentBadge],
  );
}

/** Mục đang mở: "/" phải khớp đúng, còn lại khớp cả trang con (/albums/abc). */
export function isNavActive(to: string, pathname: string) {
  return to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
}
