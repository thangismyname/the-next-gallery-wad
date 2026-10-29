import type { TFunction } from "i18next";
import { Moment } from "@/types";

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
  if (mins < 60) return t("moments.timeMin", { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("moments.timeHour", { n: hours });
  const days = Math.floor(hours / 24);
  return t("moments.timeDay", { n: days });
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
