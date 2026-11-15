import { useTranslation } from "react-i18next";
import { getInitials, resolveMediaUrl, type MomentFilter, type MomentPerson } from "@tng/shared";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type Props = {
  value: MomentFilter;
  onChange: (filter: MomentFilter) => void;
  people: MomentPerson[];
  me: { name: string; image: string | null } | null;
};

const isPerson = (f: MomentFilter, userId: string) => typeof f === "object" && f.userId === userId;

/**
 * Who to watch (Locket-style): All · Me · one avatar per friend in the loaded
 * feed (newest poster first). A soft foreground ring = they posted something you haven't
 * seen. Scrolls sideways when there are many friends.
 */
export function MomentFilterBar({ value, onChange, people, me }: Props) {
  const { t } = useTranslation();
  const pill = (active: boolean) =>
    cn(
      "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors",
      active
        ? "border-foreground bg-foreground text-background"
        : "border-border/70 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
    );

  return (
    <div
      role="radiogroup"
      aria-label={t("moments.filter")}
      className="flex items-center gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none] sm:justify-center [&::-webkit-scrollbar]:hidden"
    >
      <button type="button" role="radio" aria-checked={value === "all"} onClick={() => onChange("all")} className={pill(value === "all")}>
        {t("moments.filterAll")}
      </button>
      {me && (
        <button type="button" role="radio" aria-checked={value === "me"} onClick={() => onChange("me")} className={pill(value === "me")}>
          <Avatar size="sm" className="-ml-2 size-6">
            {me.image && <AvatarImage src={resolveMediaUrl(me.image)} alt="" />}
            <AvatarFallback className="text-[10px]">{getInitials(me.name)}</AvatarFallback>
          </Avatar>
          {t("moments.you")}
        </button>
      )}
      {people.length > 0 && <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />}
      {people.map((p) => {
        const active = isPerson(value, p.userId);
        return (
          <button
            key={p.userId}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={p.unseen ? `${p.userName} · ${t("moments.new")}` : p.userName}
            title={p.userName}
            onClick={() => onChange(active ? "all" : { userId: p.userId })}
            className={cn(
              "relative grid size-10 shrink-0 place-items-center rounded-full p-0.5 transition",
              active ? "ring-2 ring-foreground" : p.unseen ? "ring-2 ring-foreground/45" : "ring-1 ring-border/70 hover:ring-foreground/40",
            )}
          >
            <Avatar className="size-full">
              {p.userAvatarUrl && <AvatarImage src={resolveMediaUrl(p.userAvatarUrl)} alt="" />}
              <AvatarFallback className="text-xs">{getInitials(p.userName)}</AvatarFallback>
            </Avatar>
          </button>
        );
      })}
    </div>
  );
}
