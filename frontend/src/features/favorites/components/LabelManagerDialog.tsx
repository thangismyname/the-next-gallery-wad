import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { LABEL_COLORS, type LabelColor, type UserLabel } from "@/services/labels";
import { cn } from "@/lib/utils";
import { LABEL_DOT } from "../labelColors";
import { useLabelActions, useLabels } from "../useLabels";
import { useLabelManager } from "../useLabelManager";

/** Lỗi API → câu báo (trùng tên / quá số nhãn). */
function errorKey(err: unknown) {
  const code = (err as { code?: string })?.code;
  if (code === "LABEL_EXISTS") return "favorites.labels.exists";
  if (code === "LABEL_LIMIT") return "favorites.labels.limit";
  return "favorites.labels.failed";
}

function ColorPicker({
  value,
  onChange,
}: {
  value: LabelColor;
  onChange: (color: LabelColor) => void;
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("favorites.labels.color")}
          className="flex size-9 shrink-0 items-center justify-center rounded-md border border-input hover:bg-muted"
        >
          <span className={cn("size-3 rounded-full", LABEL_DOT[value])} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="grid min-w-0 grid-cols-6 gap-1 p-1.5">
        {LABEL_COLORS.map((color) => (
          <DropdownMenuItem
            key={color}
            onSelect={() => onChange(color)}
            aria-label={t(`favorites.labels.colors.${color}`)}
            className={cn(
              "flex size-7 items-center justify-center rounded-full p-0",
              color === value && "ring-2 ring-ring",
            )}
          >
            <span className={cn("size-3.5 rounded-full", LABEL_DOT[color])} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** 1 dòng nhãn: đổi màu, đổi tên (lưu khi rời ô / Enter), xoá (bấm 2 lần). */
function LabelRow({ label }: { label: UserLabel }) {
  const { t } = useTranslation();
  const { update, remove } = useLabelActions();
  const [name, setName] = useState(label.name);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveName = () => {
    const next = name.trim();
    if (!next || next === label.name) return setName(label.name);
    setError(null);
    update(label.id, { name: next }).catch((err) => {
      setError(errorKey(err));
      setName(label.name);
    });
  };

  return (
    <li className="space-y-1">
      <div className="flex items-center gap-2">
        <ColorPicker
          value={label.color}
          onChange={(color) => void update(label.id, { color }).catch(() => {})}
        />
        <Input
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          aria-label={t("favorites.labels.namePlaceholder")}
        />
        <span className="w-8 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
          {label.count}
        </span>
        <Button
          variant={confirm ? "destructive" : "ghost"}
          size={confirm ? "sm" : "icon"}
          onClick={() => (confirm ? void remove(label.id) : setConfirm(true))}
          onBlur={() => setConfirm(false)}
          aria-label={t("favorites.labels.delete")}
          className="shrink-0"
        >
          {confirm ? t("favorites.labels.deleteConfirm") : <Trash2 className="size-4" />}
        </Button>
      </div>
      {error && <p className="pl-11 text-xs text-destructive">{t(error)}</p>}
    </li>
  );
}

/** Dialog "Quản lý nhãn" — mở qua useLabelManager, render ở MainLayout. */
export function LabelManagerDialog() {
  const { t } = useTranslation();
  const open = useLabelManager((s) => s.open);
  const setOpen = useLabelManager((s) => s.setOpen);
  const { labels } = useLabels(open);
  const { create } = useLabelActions();
  const [name, setName] = useState("");
  const [color, setColor] = useState<LabelColor>("slate");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await create(name.trim(), color);
      setName("");
    } catch (err) {
      setError(errorKey(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("favorites.labels.manage")}</DialogTitle>
          <DialogDescription>{t("favorites.labels.manageDesc")}</DialogDescription>
        </DialogHeader>

        {labels.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {t("favorites.labels.empty")}
          </p>
        ) : (
          <ul className="max-h-[50vh] space-y-2 overflow-y-auto py-1 pr-1">
            {labels.map((label) => (
              <LabelRow key={`${label.id}-${label.name}`} label={label} />
            ))}
          </ul>
        )}

        <form onSubmit={add} className="space-y-1 border-t border-border/60 pt-3">
          <div className="flex items-center gap-2">
            <ColorPicker value={color} onChange={setColor} />
            <Input
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("favorites.labels.namePlaceholder")}
            />
            <Button type="submit" disabled={busy || !name.trim()} className="shrink-0">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {t("favorites.labels.create")}
            </Button>
          </div>
          {error && <p className="pl-11 text-xs text-destructive">{t(error)}</p>}
        </form>
      </DialogContent>
    </Dialog>
  );
}
