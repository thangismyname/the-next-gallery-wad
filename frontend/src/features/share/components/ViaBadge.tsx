import React from "react";
import { useTranslation } from "react-i18next";
import { CloudUpload, Copy, Radio, Server, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export type ViaKind = "p2p" | "turn" | "relay" | "server" | "copy";

const ICONS: Record<ViaKind, React.ElementType> = {
  p2p: Zap,
  turn: Radio,
  relay: CloudUpload,
  server: Server,
  copy: Copy,
};

/** Đường đi của dữ liệu: P2P trực tiếp · qua TURN · relay mã hoá · server · copy. */
export const ViaBadge: React.FC<{ via: ViaKind | null | undefined; className?: string }> = ({
  via,
  className,
}) => {
  const { t } = useTranslation();
  if (!via) return null;
  const Icon = ICONS[via];
  return (
    <span
      title={t(`transfer.via.${via}Hint`)}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border/60 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-muted-foreground uppercase",
        className,
      )}
    >
      <Icon className="size-3" />
      {t(`transfer.via.${via}`)}
    </span>
  );
};
