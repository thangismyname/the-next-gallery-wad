import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Chờ tải code của trang (route lazy) hoặc chờ phiên đăng nhập. */
export function RouteFallback({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn(
        "flex w-full items-center justify-center text-muted-foreground",
        fullScreen ? "min-h-svh" : "min-h-[40vh]",
      )}
    >
      <Loader2 className="size-5 animate-spin" />
    </div>
  );
}
