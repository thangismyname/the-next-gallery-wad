import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Settings2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { LABEL_DOT } from "../labelColors";
import { useLabelActions, useLabels } from "../useLabels";
import { useLabelManager } from "../useLabelManager";

/**
 * Menu gắn / gỡ nhãn cho 1 hoặc nhiều ảnh (thanh chọn ảnh). Nhãn được tick
 * khi MỌI ảnh đã biết đều có nó → bấm = gỡ; ngược lại bấm = gắn cho tất cả.
 */
export function LabelMenu({
  mediaIds,
  children,
  side = "top",
}: {
  mediaIds: string[];
  /** Nút mở menu (asChild). */
  children: React.ReactElement;
  side?: "top" | "bottom";
}) {
  const { t } = useTranslation();
  const { labels } = useLabels();
  const { knownLabelIds, toggleMedia } = useLabelActions();
  const openManager = useLabelManager((s) => s.setOpen);
  // Ảnh ngoài trang Yêu thích chưa có nhãn trong cache → nhớ thao tác vừa làm.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const isOn = (labelId: string) =>
    overrides[labelId] ??
    (mediaIds.length > 0 && mediaIds.every((id) => knownLabelIds(id).includes(labelId)));

  return (
    <DropdownMenu onOpenChange={(open) => !open && setOverrides({})}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="end" className="w-56">
        <DropdownMenuLabel>{t("favorites.labels.add")}</DropdownMenuLabel>
        {labels.map((label) => {
          const on = isOn(label.id);
          return (
            <DropdownMenuCheckboxItem
              key={label.id}
              checked={on}
              // Giữ menu mở để gắn nhiều nhãn liền.
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => {
                setOverrides((o) => ({ ...o, [label.id]: !on }));
                void toggleMedia(label.id, mediaIds, !on).catch(() =>
                  setOverrides((o) => ({ ...o, [label.id]: on })),
                );
              }}
              className="normal-case tracking-normal"
            >
              <span className={cn("size-2.5 shrink-0 rounded-full", LABEL_DOT[label.color])} />
              <span className="truncate">{label.name}</span>
            </DropdownMenuCheckboxItem>
          );
        })}
        {labels.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem onSelect={() => openManager(true)}>
          <Settings2 />
          {t("favorites.labels.manage")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
