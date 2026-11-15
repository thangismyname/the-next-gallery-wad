import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, UserPlus, Users, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { claimInviteToken } from "@/services/friends";
import { FriendRequestResult } from "@tng/shared";

export const FriendInviteHandler: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("t") ?? "";

  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const [result, setResult] = useState<FriendRequestResult | null>(null);
  const [ownerName, setOwnerName] = useState("");
  const [errorExpired, setErrorExpired] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setState("error");
      return;
    }
    claimInviteToken(token)
      .then((res) => {
        if (cancelled) return;
        setResult(res.result);
        setOwnerName(res.owner?.name ?? "");
        setState("done");
      })
      .catch((err: Error & { code?: string }) => {
        if (cancelled) return;
        setErrorExpired(err.code === "EXPIRED");
        setState("error");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const goFriends = () => navigate("/friends");

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="mx-auto w-full max-w-sm rounded-xl border border-border/50 bg-card p-6 text-center">
        {state === "loading" && (
          <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
            <p className="text-sm">{t("friends.inviteProcessing")}</p>
          </div>
        )}

        {state === "error" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <XCircle className="size-10 text-destructive" />
            <p className="text-sm font-medium text-foreground">
              {errorExpired
                ? t("friends.inviteExpired")
                : t("friends.inviteInvalid")}
            </p>
            <Button variant="outline" size="sm" onClick={goFriends}>
              {t("friends.goToFriends")}
            </Button>
          </div>
        )}

        {state === "done" && (
          <div className="flex flex-col items-center gap-3 py-8">
            {result === "accepted" ? (
              <>
                <CheckCircle2 className="size-10 text-primary" />
                <p className="text-sm text-foreground">
                  {t("friends.nowFriends", { name: ownerName })}
                </p>
              </>
            ) : result === "already_friends" ? (
              <>
                <CheckCircle2 className="size-10 text-primary" />
                <p className="text-sm text-foreground">
                  {t("friends.inviteAlreadyFriends", { name: ownerName })}
                </p>
              </>
            ) : result === "sent" ? (
              <>
                <UserPlus className="size-10 text-primary" />
                <p className="text-sm text-foreground">
                  {t("friends.inviteSent", { name: ownerName })}
                </p>
              </>
            ) : result === "pending_inbound" ? (
              <>
                <Users className="size-10 text-primary" />
                <p className="text-sm text-foreground">
                  {t("friends.invitePendingInbound", { name: ownerName })}
                </p>
              </>
            ) : (
              <>
                <CheckCircle2 className="size-10 text-primary" />
                <p className="text-sm text-foreground">
                  {t("friends.invitePendingOutbound", { name: ownerName })}
                </p>
              </>
            )}
            <Button variant="outline" size="sm" onClick={goFriends}>
              {t("friends.goToFriends")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
