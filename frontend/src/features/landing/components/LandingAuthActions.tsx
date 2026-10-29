import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useLandingCta } from "../useLandingCta";

/**
 * Góc phải header landing: đang kiểm tra phiên → khung chờ (không nháy nút
 * Đăng nhập); đã đăng nhập → "Mở thư viện" (hồ sơ / tài khoản xử lý trong
 * app, không đặt avatar ở landing); chưa → "Đăng nhập".
 */
export function LandingAuthActions({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { isAuthenticated, isPending, go } = useLandingCta();

  if (isPending)
    return <Skeleton className={cn("h-8 w-28 rounded-none bg-muted/60", className)} />;

  if (isAuthenticated) {
    return (
      <Button
        size="sm"
        className={cn("rounded-none font-mono text-xs uppercase tracking-widest", className)}
        onClick={go}
      >
        {t("nav.openGallery")}
      </Button>
    );
  }

  return (
    <Button
      asChild
      size="sm"
      className={cn("rounded-none font-mono text-xs uppercase tracking-widest", className)}
    >
      <Link to="/auth">{t("nav.login")}</Link>
    </Button>
  );
}
