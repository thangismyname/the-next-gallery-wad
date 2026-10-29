import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, UserMinus, UserPlus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fetchFriends } from "@/services/friends";
import {
  type MemberRole,
  albumMembersQueryKey,
  albumQueryKey,
  fetchAlbumMembers,
  inviteAlbumMembers,
  removeAlbumMember,
  updateAlbumMember,
} from "@/services/albums";
import { getInitials } from "@/utils/string";
import { SettingOptionGroup } from "@/features/settings/components/SettingOptionGroup";

type Props = { albumId: string; canManage: boolean };

/** Thành viên album chung: owner mời bạn bè (editor / viewer), đổi vai trò, gỡ. */
export const AlbumMembersPanel: React.FC<Props> = ({ albumId, canManage }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<string[]>([]);
  const [role, setRole] = useState<MemberRole>("viewer");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: members = [], isPending } = useQuery({
    queryKey: albumMembersQueryKey(albumId),
    queryFn: () => fetchAlbumMembers(albumId),
  });
  const { data: friends = [] } = useQuery({
    queryKey: ["friends", "list"],
    queryFn: fetchFriends,
    staleTime: 60_000,
    enabled: canManage,
  });
  const memberIds = new Set(members.map((m) => m.userId));
  const invitable = friends.filter((f) => !memberIds.has(f.id));

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: albumMembersQueryKey(albumId),
      }),
      queryClient.invalidateQueries({ queryKey: albumQueryKey(albumId) }),
    ]);

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <ul className="max-h-64 divide-y divide-border/60 overflow-y-auto">
        {isPending ? (
          <Skeleton className="h-12 rounded-lg bg-muted/40" />
        ) : (
          members.map((m) => (
            <li key={m.userId} className="flex items-center gap-3 py-2">
              <Avatar className="size-8">
                {m.image && <AvatarImage src={m.image} alt="" />}
                <AvatarFallback className="text-xs">
                  {getInitials(m.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.name ?? m.email}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {m.email}
                </p>
              </div>
              {m.pending && (
                <Badge variant="outline">{t("albums.pendingInvite")}</Badge>
              )}
              {canManage && m.role !== "owner" ? (
                <>
                  <select
                    value={m.role}
                    disabled={busy !== null}
                    onChange={(e) =>
                      void run(m.userId, () =>
                        updateAlbumMember(
                          albumId,
                          m.userId,
                          e.target.value as MemberRole,
                        ),
                      )
                    }
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                    aria-label={t("albums.role")}
                  >
                    <option value="editor">{t("albums.roles.editor")}</option>
                    <option value="viewer">{t("albums.roles.viewer")}</option>
                  </select>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={busy !== null}
                    onClick={() =>
                      void run(m.userId, () =>
                        removeAlbumMember(albumId, m.userId),
                      )
                    }
                    aria-label={t("albums.removeMember")}
                    title={t("albums.removeMember")}
                  >
                    {busy === m.userId ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <UserMinus className="size-4" />
                    )}
                  </Button>
                </>
              ) : (
                <Badge variant="secondary">{t(`albums.roles.${m.role}`)}</Badge>
              )}
            </li>
          ))
        )}
      </ul>

      {canManage && (
        <div className="space-y-3 border-t border-border/60 pt-4">
          <p className="text-sm font-medium">{t("albums.inviteFriends")}</p>
          {invitable.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("albums.noFriendsToInvite")}
            </p>
          ) : (
            <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
              {invitable.map((f) => {
                const active = picked.includes(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setPicked((prev) =>
                        active
                          ? prev.filter((x) => x !== f.id)
                          : [...prev, f.id],
                      )
                    }
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs transition-colors",
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-muted/40",
                    )}
                  >
                    {f.name}
                  </button>
                );
              })}
            </div>
          )}
          <SettingOptionGroup<MemberRole>
            label={t("albums.role")}
            value={role}
            onChange={setRole}
            options={[
              { value: "viewer", label: t("albums.roles.viewer") },
              { value: "editor", label: t("albums.roles.editor") },
            ]}
          />
          <p className="text-xs text-muted-foreground">
            {t(`albums.roleHint.${role}`)}
          </p>
          <Button
            className="w-full"
            disabled={picked.length === 0 || busy !== null}
            onClick={() =>
              void run("invite", async () => {
                await inviteAlbumMembers(albumId, picked, role);
                setPicked([]);
              })
            }
          >
            {busy === "invite" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <UserPlus className="size-4" />
            )}
            {t("albums.invite", { n: picked.length })}
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
};
