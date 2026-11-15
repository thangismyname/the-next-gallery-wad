import { FolderOpen, Heart, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { LABEL_DOT } from "@/features/favorites/labelColors";
import type { SearchScope } from "../searchScope";

/** Icon của 1 phạm vi tìm kiếm (Yêu thích / nhãn / album / ảnh đã sửa). */
export const ScopeIcon: React.FC<{ scope: SearchScope; className?: string }> = ({ scope, className }) => {
  if (scope.kind === "favorites") return <Heart className={cn("size-3.5 text-rose-500", className)} />;
  if (scope.kind === "album") return <FolderOpen className={cn("size-3.5", className)} />;
  if (scope.kind === "edited") return <Wand2 className={cn("size-3.5", className)} />;
  return <span className={cn("size-2 shrink-0 rounded-full", scope.color && LABEL_DOT[scope.color])} />;
};
