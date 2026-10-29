import { useTranslation } from "react-i18next";
import { Check, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { UserLabel } from "@/services/labels";
import { cn } from "@/lib/utils";
import { LABEL_DOT } from "../labelColors";
import { useLabelManager } from "../useLabelManager";

/** Mobile: chọn nhãn để lọc trang Yêu thích (sheet từ dưới lên). */
export function LabelFilterSheet({
  open,
  onOpenChange,
  labels,
  activeId,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: UserLabel[];
  activeId: string | null;
  onPick: (labelId: string) => void;
}) {
  const { t } = useTranslation();
  const openManager = useLabelManager((s) => s.setOpen);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[75svh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]">
        <SheetHeader>
          <SheetTitle>{t("favorites.labels.title")}</SheetTitle>
        </SheetHeader>
        <ul className="overflow-y-auto px-2">
          {labels.map((label) => (
            <li key={label.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(label.id);
                  onOpenChange(false);
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm active:bg-muted",
                  activeId === label.id && "bg-muted/60 font-medium",
                )}
              >
                <span className={cn("size-2.5 shrink-0 rounded-full", LABEL_DOT[label.color])} />
                <span className="min-w-0 flex-1 truncate">{label.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{label.count}</span>
                <Check
                  className={cn("size-4 shrink-0", activeId === label.id ? "opacity-100" : "opacity-0")}
                />
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-border/60 p-3">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              onOpenChange(false);
              openManager(true);
            }}
          >
            <Settings2 className="size-4" />
            {t("favorites.labels.manage")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
