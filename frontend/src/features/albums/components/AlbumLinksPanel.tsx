import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Link2, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type ShareLink,
  albumLinksQueryKey,
  createAlbumLink,
  deleteAlbumLink,
  fetchAlbumLinks,
  publicAlbumUrl,
} from "@/services/albums";
import { SettingOptionGroup } from "@/features/settings/components/SettingOptionGroup";

const EXPIRY_OPTIONS = ["never", "1", "7", "30"] as const;
type Expiry = (typeof EXPIRY_OPTIONS)[number];

/** Link công khai: ai có link đều xem được album, không cần tài khoản. */
export const AlbumLinksPanel: React.FC<{ albumId: string }> = ({ albumId }) => {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [permission, setPermission] = useState<ShareLink["permission"]>("view");
  const [expiry, setExpiry] = useState<Expiry>("7");
  const [maxViews, setMaxViews] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const { data: links = [], isPending } = useQuery({
    queryKey: albumLinksQueryKey(albumId),
    queryFn: () => fetchAlbumLinks(albumId),
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: albumLinksQueryKey(albumId) });

  const create = async () => {
    setBusy("create");
    try {
      const link = await createAlbumLink(albumId, {
        permission,
        expiresInDays: expiry === "never" ? null : Number(expiry),
        maxViews: maxViews ? Number(maxViews) : null,
      });
      await refresh();
      void copy(link);
    } finally {
      setBusy(null);
    }
  };

  const revoke = async (link: ShareLink) => {
    setBusy(link.id);
    try {
      await deleteAlbumLink(albumId, link.id);
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const copy = async (link: ShareLink) => {
    try {
      await navigator.clipboard.writeText(publicAlbumUrl(link.token));
      setCopied(link.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard bị chặn — người dùng tự chép từ ô link */
    }
  };

  const expired = (link: ShareLink) =>
    (link.expiresAt && new Date(link.expiresAt) < new Date()) ||
    (link.maxViews !== null && link.viewCount >= link.maxViews);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <SettingOptionGroup<ShareLink["permission"]>
          label={t("albums.links.permission")}
          value={permission}
          onChange={setPermission}
          options={[
            { value: "view", label: t("albums.links.view") },
            { value: "download", label: t("albums.links.download") },
          ]}
        />
        <SettingOptionGroup<Expiry>
          label={t("albums.links.expiry")}
          value={expiry}
          onChange={setExpiry}
          options={EXPIRY_OPTIONS.map((value) => ({
            value,
            label:
              value === "never"
                ? t("albums.links.never")
                : t("albums.links.days", { n: Number(value) }),
          }))}
        />
        <div className="space-y-1.5">
          <Label htmlFor="link-max-views">{t("albums.links.maxViews")}</Label>
          <Input
            id="link-max-views"
            type="number"
            min={1}
            inputMode="numeric"
            value={maxViews}
            placeholder={t("albums.links.unlimited")}
            onChange={(e) => setMaxViews(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <Button
          className="w-full"
          disabled={busy !== null}
          onClick={() => void create()}
        >
          {busy === "create" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Link2 className="size-4" />
          )}
          {t("albums.links.create")}
        </Button>
      </div>

      <div className="space-y-2 border-t border-border/60 pt-4">
        <p className="text-sm font-medium">{t("albums.links.active")}</p>
        {isPending ? (
          <Skeleton className="h-14 rounded-lg bg-muted/40" />
        ) : links.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("albums.links.none")}
          </p>
        ) : (
          links.map((link) => (
            <div
              key={link.id}
              className="flex items-center gap-2 rounded-lg border border-border/60 p-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs">
                  {publicAlbumUrl(link.token)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {[
                    t(`albums.links.${link.permission}`),
                    link.expiresAt
                      ? t("albums.links.until", {
                          date: new Date(link.expiresAt).toLocaleDateString(
                            i18n.language,
                          ),
                        })
                      : t("albums.links.never"),
                    t("albums.links.views", {
                      n: link.viewCount,
                      max: link.maxViews ?? "∞",
                    }),
                    expired(link) ? t("albums.links.expired") : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void copy(link)}
                aria-label={t("albums.links.copy")}
                title={t("albums.links.copy")}
              >
                {copied === link.id ? (
                  <Check className="size-4 text-emerald-500" />
                ) : (
                  <Copy className="size-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={busy !== null}
                onClick={() => void revoke(link)}
                aria-label={t("albums.links.revoke")}
                title={t("albums.links.revoke")}
              >
                {busy === link.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4 text-destructive" />
                )}
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
