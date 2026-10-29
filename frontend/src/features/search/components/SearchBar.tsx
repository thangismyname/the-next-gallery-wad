import React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  readOnly?: boolean;
  onClick?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Hiện trước ô nhập (vd chip phạm vi "♥ Yêu thích ×" của Spotlight). */
  prefix?: React.ReactNode;
  /** Ref tới ô nhập — để đặt lại con trỏ sau khi chèn / gỡ chip. */
  inputRef?: React.Ref<HTMLInputElement>;
  className?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChange,
  onClear,
  placeholder = "Search photos, tags, objects...",
  autoFocus = false,
  readOnly = false,
  onClick,
  onKeyDown,
  prefix,
  inputRef,
  className,
}) => {
  return (
    // Light: ô tìm kiếm thường (nền sáng, viền mảnh). Dark: nền đen + chữ / icon / viền xám.
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-full border border-input bg-background px-4 py-2 text-sm text-foreground",
        "transition-colors focus-within:border-ring dark:border-white/15 dark:bg-black dark:text-neutral-100 dark:focus-within:border-white/30",
        className,
      )}
    >
      <Search className="size-4 shrink-0 text-muted-foreground dark:text-neutral-400" />
      {prefix}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        readOnly={readOnly}
        onClick={onClick}
        onKeyDown={onKeyDown}
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground dark:placeholder:text-neutral-500"
      />
      {value && onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear"
          className="shrink-0 text-muted-foreground hover:text-foreground dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
};
