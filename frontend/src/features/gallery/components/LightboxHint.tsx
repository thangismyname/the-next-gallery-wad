import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Props = {
  /** Tên ngắn của nút (dòng đậm). */
  label: string;
  /** Nút này làm gì (dòng phụ). */
  hint?: string;
  /** Phím tắt, vd "Esc", "+", "←". */
  shortcut?: string;
  side?: "top" | "bottom" | "left" | "right";
  /** Đúng 1 phần tử (button / a) — nhận ref + sự kiện hover của tooltip. */
  children: React.ReactElement;
};

/**
 * Tooltip mô tả 1 nút trong Lightbox: tên + phím tắt + công dụng. Thẻ `glass`
 * theo theme sáng / tối (cùng kiểu Spotlight, phím tắt như `kbd` của Spotlight),
 * không mũi tên. Nằm trên Lightbox (z-50) nên dùng z-[60]; độ trễ đặt ở
 * TooltipProvider của Lightbox.
 */
export const LightboxHint: React.FC<Props> = ({ label, hint, shortcut, side = "bottom", children }) => (
  <Tooltip>
    <TooltipTrigger asChild>{children}</TooltipTrigger>
    <TooltipContent
      side={side}
      sideOffset={8}
      arrowClassName="hidden"
      className="glass bg-background/90 z-[60] max-w-64 flex-col items-start gap-1 rounded-xl px-3 py-2 text-foreground"
    >
      <span className="flex w-full items-center justify-between gap-3 text-xs font-medium">
        {label}
        {shortcut && (
          <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-muted/70 px-1.5 font-mono text-[10px] font-normal text-muted-foreground">
            {shortcut}
          </kbd>
        )}
      </span>
      {hint && <span className="text-[11px] leading-snug text-muted-foreground">{hint}</span>}
    </TooltipContent>
  </Tooltip>
);
