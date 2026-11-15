import React from "react";
import { FolderOpen, Heart, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { LABEL_DOT } from "@/features/favorites/labelColors";
import { useTagCatalog } from "@/features/studio/useTagCatalog";
import type { Lens } from "../lens";

/** Biểu tượng của 1 lens: tim (Yêu thích) · chấm màu (nhãn) · thư mục (album) · icon tag AI
 * (danh mục, hoặc icon nhóm của nhãn chi tiết). */
export const LensIcon: React.FC<{ lens: Lens; className?: string }> = ({ lens, className }) => {
  const { describe } = useTagCatalog();
  if (lens.kind === "tag") {
    const Icon = describe(lens.tag)?.Icon ?? Sparkles;
    return <Icon className={cn("size-3.5", className)} />;
  }
  if (lens.kind !== "scope") return null;
  const { scope } = lens;
  if (scope.kind === "favorites") return <Heart className={cn("size-3.5 text-rose-500", className)} />;
  if (scope.kind === "album") return <FolderOpen className={cn("size-3.5", className)} />;
  return <span className={cn("size-2 shrink-0 rounded-full", scope.color && LABEL_DOT[scope.color])} />;
};

