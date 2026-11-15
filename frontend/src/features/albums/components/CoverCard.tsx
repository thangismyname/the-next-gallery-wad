import { Link } from "react-router-dom";
import { Images, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  to: string;
  title: string;
  subtitle: string;
  coverUrl: string | null;
  /** Icon khi chưa có ảnh bìa (mặc định Images). */
  icon?: LucideIcon;
  iconClassName?: string;
  /** Hiện trước tên: icon nhỏ hoặc chấm màu (nhãn). */
  leading?: React.ReactNode;
};

/** Ô trong lưới Albums: ảnh bìa vuông + tên + dòng phụ. Dùng cho album tự động và bộ sưu tập. */
export const CoverCard: React.FC<Props> = ({
  to,
  title,
  subtitle,
  coverUrl,
  icon: Icon = Images,
  iconClassName,
  leading,
}) => (
  <Link
    to={to}
    className="group block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:w-44"
  >
    <div className="relative aspect-square overflow-hidden rounded-xl bg-muted/50">
      {coverUrl ? (
        <img
          src={coverUrl}
          alt=""
          loading="lazy"
          className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <Icon
          className={cn(
            "absolute top-1/2 left-1/2 size-8 -translate-1/2 text-muted-foreground/40",
            iconClassName,
          )}
        />
      )}
    </div>
    <div className="mt-2 min-w-0 px-0.5">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        {leading}
        <span className="truncate">{title}</span>
      </p>
      <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
    </div>
  </Link>
);
