import { Children, Fragment, type ReactNode } from "react";
import { ChevronRight, Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Settings section — same order / rows as the mobile account sheet, styled like
 * the rest of the web: a bordered card (`bg-card`, hairline dividers), heading +
 * footnote outside it. Actions inside rows are regular shadcn `Button`s.
 */
export function SettingsGroup({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: string;
  children: ReactNode;
}) {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <section className="space-y-2">
      {title && <h2 className="px-1 text-sm font-semibold">{title}</h2>}
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 && <div className="h-px bg-border/60" />}
            {row}
          </Fragment>
        ))}
      </div>
      {footer && <p className="px-1 text-xs text-muted-foreground">{footer}</p>}
    </section>
  );
}

type RowProps = {
  icon?: LucideIcon;
  iconClassName?: string;
  title: string;
  subtitle?: string;
  value?: string;
  /** Actions on the right (Buttons, Badge…). */
  trailing?: ReactNode;
  chevron?: boolean;
  destructive?: boolean;
  busy?: boolean;
  disabled?: boolean;
  /** Whole row clickable (navigation rows) — otherwise put a Button in `trailing`. */
  onClick?: () => void;
  /** Extra content under the title line (progress bar, option group…). */
  children?: ReactNode;
};

/** One row: icon · title (+ subtitle) · value / trailing actions. */
export function SettingsRow({
  icon: Icon,
  iconClassName,
  title,
  subtitle,
  value,
  trailing,
  chevron,
  destructive,
  busy,
  disabled,
  onClick,
  children,
}: RowProps) {
  const body = (
    <>
      <div className="flex min-h-9 items-center gap-3">
        {Icon && (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className={cn("size-4", destructive && "text-destructive", iconClassName)} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-medium", destructive && "text-destructive")}>{title}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {value && <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{value}</span>}
        {busy ? <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" /> : trailing}
        {chevron && <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
      </div>
      {children && <div className={cn(Icon && "pl-11")}>{children}</div>}
    </>
  );
  const className = cn("block w-full space-y-3 px-4 py-3.5 text-left", disabled && "opacity-50");
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={cn(
        className,
        "transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
      )}
    >
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}

/**
 * 1-of-N option group (theme, language, grid density) — the web's bordered
 * option tiles (like `SettingOptionGroup`), not the mobile pill.
 * `origin` = the clicked button (theme transition center).
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T, origin: HTMLElement) => void;
  options: { value: T; label: string; icon?: LucideIcon }[];
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map(({ value: v, label: optionLabel, icon: Icon }) => {
        const active = v === value;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={(e) => onChange(v, e.currentTarget)}
            className={cn(
              "flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-primary",
              active
                ? "border-primary bg-primary/10 font-medium text-foreground"
                : "border-border/60 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            {Icon && <Icon className="size-4 shrink-0" />}
            <span className="truncate">{optionLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
