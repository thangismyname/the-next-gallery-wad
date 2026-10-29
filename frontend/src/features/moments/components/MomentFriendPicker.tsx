import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchFriends } from "@/services/friends";
import { cn } from "@/lib/utils";

type Props = {
  selectedIds: string[];
  /** Số bạn tối đa được mời (creator phải chừa ≥1 slot cho bạn). */
  max: number;
  onToggle: (friendId: string) => void;
};

/** Chọn bạn bè mời vào moment collab — chip tên, tối đa `max` người. */
export const MomentFriendPicker: React.FC<Props> = ({
  selectedIds,
  max,
  onToggle,
}) => {
  const { t } = useTranslation();
  const { data: friends = [], isPending } = useQuery({
    queryKey: ["friends", "list"],
    queryFn: fetchFriends,
    staleTime: 60_000,
  });

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">
        {max > 1
          ? t("moments.selectFriendsRange", { max })
          : t("moments.selectFriends", { n: max })}
      </p>
      <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto pr-1">
        {isPending ? (
          <Skeleton className="h-7 w-full rounded-md bg-muted/40" />
        ) : friends.length === 0 ? (
          <p className="text-xs text-muted-foreground/70">
            {t("moments.noFriends")}
          </p>
        ) : (
          friends.map((friend) => {
            const active = selectedIds.includes(friend.id);
            return (
              <button
                key={friend.id}
                type="button"
                onClick={() => onToggle(friend.id)}
                className={cn(
                  "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition hover:bg-muted/40",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border",
                )}
                title={friend.name}
              >
                <span className="grid size-4 shrink-0 place-items-center rounded-full bg-muted text-[9px] font-semibold">
                  {friend.name.charAt(0).toUpperCase()}
                </span>
                <span className="truncate">{friend.name}</span>
                {active && <Check className="size-3 shrink-0" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
