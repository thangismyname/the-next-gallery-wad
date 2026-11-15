import type { TFunction } from "i18next";
import { Moment } from "@tng/shared";

export interface MomentParticipant {
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
}

/** "vừa xong" / "5 phút" / "3 giờ" / "2 ngày" — dùng cho card moment + meme. */
export function timeAgo(iso: string, t: TFunction): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return t("moments.timeJustNow");
  const lang = (typeof navigator !== "undefined" ? navigator.language : "vi") || "vi";
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  if (mins < 60) return rtf.format(-mins, "minute");
  const hours = Math.floor(mins / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.floor(hours / 24);
  return rtf.format(-days, "day");
}

/**
 * Người tham gia 1 moment: creator đứng đầu, rồi các user của slot đã filled
 * theo thứ tự slot — dedupe theo userId (creator ghim nhiều ảnh / self-fill
 * chỉ tính 1 lần). single → chỉ [creator].
 */
export function getMomentParticipants(moment: Moment): MomentParticipant[] {
  const creator: MomentParticipant = {
    userId: moment.userId,
    userName: moment.userName,
    userAvatarUrl: moment.userAvatarUrl ?? null,
  };
  if (moment.template === "single") return [creator];

  const seen = new Set<string>([moment.userId]);
  const out = [creator];
  for (const slot of moment.slots) {
    if (!slot.filled || !slot.userId || seen.has(slot.userId)) continue;
    seen.add(slot.userId);
    out.push({
      userId: slot.userId,
      userName: slot.userName,
      userAvatarUrl: slot.userAvatarUrl ?? null,
    });
  }
  return out;
}
