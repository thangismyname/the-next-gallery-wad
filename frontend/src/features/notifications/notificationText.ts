// Câu hiển thị của 1 thông báo (danh sách + toast) — chọn key ở `@tng/shared` notificationMessage.
import type { TFunction } from "i18next";
import { notificationMessage } from "@tng/shared";

export function notificationText(
  n: { type: string; payload?: Record<string, unknown> | null },
  name: string,
  t: TFunction,
): string {
  const [key, params] = notificationMessage(n, name);
  return t(key, params);
}
