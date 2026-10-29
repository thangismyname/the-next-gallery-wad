import { useTranslation } from "react-i18next";
import { Moment } from "@/types";
import { cn } from "@/lib/utils";
import { getInitials } from "@/utils/string";

type TemplateMediaProps = {
  moment: Moment;
  t: ReturnType<typeof useTranslation>["t"];
  /** slotIndex = -1 cho single; với duo/trio = slot_index của frame được tap. */
  onImageClick: (slotIndex: number) => void;
};

/**
 * Khối ảnh theo template của card moment:
 * - single: 1 ảnh full-bleed.
 * - duo_square: 2 ảnh chồng DỌC (mỗi ô ½ chiều cao), mỗi frame bo rounded-2xl.
 * - trio_wide: 3 ảnh chồng DỌC (mỗi ô ⅓ chiều cao), mỗi frame bo rounded-2xl.
 * Mỗi frame là 1 nút riêng để bấm vào slot cụ thể.
 */
export function TemplateMedia({ moment, t, onImageClick }: TemplateMediaProps) {
  const isMulti = moment.template !== "single";
  const filledSlots = moment.slots.filter((s) => s.filled);

  if (!isMulti) {
    return (
      <button
        type="button"
        onClick={() => onImageClick(-1)}
        className="absolute inset-0 block h-full w-full"
        aria-label={t("moments.open", { name: moment.userName })}
      >
        <img
          src={moment.thumbnailUrl ?? ""}
          alt={moment.caption ?? moment.userName}
          loading="lazy"
          className="size-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      </button>
    );
  }

  if (filledSlots.length === 0) {
    return (
      <span className="absolute inset-0 grid h-full w-full place-items-center bg-muted text-xs text-muted-foreground">
        {t("moments.noPhoto")}
      </span>
    );
  }

  const gridClass =
    moment.template === "duo_square"
      ? "grid-cols-1 grid-rows-2"
      : "grid-cols-1 grid-rows-3";

  return (
    <div
      className={cn("absolute inset-0 grid h-full w-full gap-0.5", gridClass)}
    >
      {filledSlots.map((cell) => (
        <button
          key={cell.slotIndex}
          type="button"
          onClick={() => onImageClick(cell.slotIndex)}
          className="relative min-h-0 min-w-0 overflow-hidden rounded-2xl"
          aria-label={t("moments.open", { name: moment.userName })}
          title={cell.userName}
        >
          <img
            src={cell.thumbnailUrl ?? ""}
            alt={cell.userName}
            loading="lazy"
            className="size-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
          {/* Badge người đăng frame — ảnh này của ai (góc trên phải ô) */}
          <span className="absolute top-1.5 right-1.5 z-5 grid size-5.5 place-items-center overflow-hidden rounded-full bg-black/55 ring-2 ring-white/80 pointer-events-none">
            {cell.userAvatarUrl ? (
              <img
                src={cell.userAvatarUrl}
                alt=""
                className="size-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : null}
            {!cell.userAvatarUrl && (
              <span className="text-[9px] leading-none font-semibold text-white">
                {getInitials(cell.userName)}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}
