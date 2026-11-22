import { useTranslation } from "react-i18next";
import { Bell, Trash2, X } from "lucide-react";
import { formatRelative, getInitials, type AppNotification } from "@tng/shared";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { notificationText } from "../notificationText";

/** Danh sách thông báo đã lưu (trong popover chuông Moments): mỗi dòng có nút xoá, thêm "Xoá hết". */
export function NotificationList({
  items,
  onDelete,
  onClear,
}: {
  items: AppNotification[];
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  const { t, i18n } = useTranslation();
  if (!items.length) return null;
  return (
    <section className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2 px-1 py-0.5 text-xs font-semibold uppercase">
        <Bell className="size-3.5 text-primary" />
        <span className="flex-1">{t("notifications.title")}</span>
        <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px] font-normal normal-case" onClick={onClear}>
          <Trash2 className="size-3" />
          {t("notifications.clearAll")}
        </Button>
      </div>
      <ul className="flex flex-col gap-0.5">
        {items.map((n) => {
          const name = n.actor?.name ?? t("notifications.someone");
          return (
            <li key={n.id} className="group flex items-start gap-2.5 rounded-md p-2 hover:bg-muted/60">
              <Avatar size="sm" className="mt-0.5 shrink-0">
                {n.actor?.image && <AvatarImage src={n.actor.image} alt="" />}
                <AvatarFallback>{getInitials(name)}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 text-xs">
                <span className="block">{notificationText(n, name, t)}</span>
                <span className="block text-[11px] text-muted-foreground">{formatRelative(n.createdAt, i18n.language)}</span>
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-6 shrink-0 opacity-60 group-hover:opacity-100"
                aria-label={t("notifications.delete")}
                title={t("notifications.delete")}
                onClick={() => onDelete(n.id)}
              >
                <X className="size-3.5" />
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
