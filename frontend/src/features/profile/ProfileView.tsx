import React from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, UserRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { authClient } from "@/services/authClient";
import { ProfileSummaryCard } from "./components/ProfileSummaryCard";
import { EditProfileForm } from "./components/EditProfileForm";
import { ChangePasswordForm } from "./components/ChangePasswordForm";

/**
 * Trang hồ sơ của chính user: cột trái = thẻ tóm tắt (avatar, huy hiệu, số
 * liệu), cột phải = sửa thông tin + đổi mật khẩu (chỉ tài khoản email/mật khẩu).
 */
export const ProfileView: React.FC = () => {
  const { t } = useTranslation();
  const { data: session, isPending, refetch } = authClient.useSession();
  const user = session?.user;

  // Các cách đăng nhập đã liên kết — quyết định có hiện form đổi mật khẩu.
  const { data: providers = [] } = useQuery({
    queryKey: ["profile", "accounts", user?.id],
    queryFn: async () => {
      const { data, error } = await authClient.listAccounts();
      if (error) throw new Error(error.message);
      return (data ?? []).map((a) => a.providerId);
    },
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
  });
  const hasPassword = providers.includes("credential");

  const passwordCard = hasPassword ? (
    <ChangePasswordForm />
  ) : providers.length > 0 ? (
    <Card>
      <CardContent className="flex items-start gap-3 text-sm text-muted-foreground">
        <KeyRound className="mt-0.5 size-4 shrink-0" />
        {t("profile.noPassword")}
      </CardContent>
    </Card>
  ) : null;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <div className="flex aspect-square size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <UserRound className="size-5" />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            {t("profile.title")}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t("profile.subtitle")}
          </p>
        </div>
      </div>

      {isPending || !user ? (
        <div className="grid gap-5 md:grid-cols-2">
          <Skeleton className="h-80 rounded-xl bg-muted/40 md:col-span-2" />
          <Skeleton className="h-96 rounded-xl bg-muted/40" />
          <Skeleton className="h-96 rounded-xl bg-muted/40" />
        </div>
      ) : (
        // md+: 2 cột — thẻ tóm tắt chiếm cả hàng, các form mỗi cái 1 ô
        // (form đứng một mình thì cũng giãn đủ 2 ô).
        <div className="grid items-start gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <ProfileSummaryCard
              name={user.name}
              email={user.email}
              image={user.image}
              createdAt={user.createdAt}
              emailVerified={user.emailVerified}
              role={user.role}
              providers={providers}
            />
          </div>

          <div className={cn(!passwordCard && "md:col-span-2")}>
            <EditProfileForm
              name={user.name}
              email={user.email}
              image={user.image}
              onSaved={() => void refetch()}
            />
          </div>

          {passwordCard}
        </div>
      )}
    </div>
  );
};
