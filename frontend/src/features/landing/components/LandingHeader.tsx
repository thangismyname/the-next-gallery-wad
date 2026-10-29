// src/features/landing/components/LandingHeader.tsx
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/features/toggles/LanguageToggle";
import { ThemeToggle } from "@/features/toggles/ThemeToggle";
import { cn } from "@/lib/utils";
import { useScrolled } from "@/hooks/useScrolled";
import { menuItem, menuPanel } from "../landing.motion";
import { LandingAuthActions } from "./LandingAuthActions";

// Chỉ trỏ tới trang có thật (chưa đăng nhập → ProtectedRoute đưa về /auth).
// `href` = neo trong landing (cuộn mượt — xem index.css).
const NAV_LINKS: { key: string; to?: string; href?: string }[] = [
  { key: "nav.gallery", to: "/gallery" },
  { key: "nav.albums", to: "/albums" },
  { key: "nav.studio", to: "/studio" },
  { key: "nav.download", href: "#download" },
];

// Gạch chân chạy ra từ trái khi rê chuột lên link.
const LINK =
  "relative transition-colors hover:text-foreground after:absolute after:-bottom-1 after:left-0 after:h-px after:w-full after:origin-left after:scale-x-0 after:bg-foreground after:transition-transform after:duration-300 hover:after:scale-x-100";

/**
 * Header landing. Desktop (md+): logo · link · toggle + CTA.
 * Mobile: logo nhỏ · CTA gọn · nút ☰ mở panel (link + toggle) trượt xuống.
 */
export function LandingHeader() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const { pathname, hash } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Cuộn khỏi đầu trang → header thu gọn + đổ bóng nhẹ.
  const scrolled = useScrolled(24);

  // Đổi trang / bấm neo → đóng menu; Esc cũng đóng.
  useEffect(() => setMenuOpen(false), [pathname, hash]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const renderLink = (link: (typeof NAV_LINKS)[number], className: string) =>
    link.href ? (
      <a key={link.key} href={link.href} className={className} onClick={() => setMenuOpen(false)}>
        {t(link.key)}
      </a>
    ) : (
      <Link key={link.key} to={link.to!} className={className}>
        {t(link.key)}
      </Link>
    );

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b bg-background/90 backdrop-blur transition-[box-shadow,border-color] duration-300",
        scrolled || menuOpen ? "border-border/80 shadow-sm shadow-black/5" : "border-border/60",
      )}
    >
      <div
        className={cn(
          "mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 transition-[padding] duration-300 sm:px-6",
          scrolled ? "py-3" : "py-3 md:py-5",
        )}
      >
        <Link
          to="/"
          className="truncate font-mono text-xs uppercase tracking-[0.15em] sm:text-sm sm:tracking-[0.2em]"
        >
          {t("app.name")}
        </Link>

        <nav className="hidden gap-8 font-mono text-xs uppercase tracking-widest text-muted-foreground md:flex">
          {NAV_LINKS.map((link) => renderLink(link, LINK))}
        </nav>

        <div className="flex shrink-0 items-center gap-1.5">
          {/* Toggle dùng chung của app — mobile chuyển vào panel menu */}
          <LanguageToggle className="hidden md:inline-flex" />
          <ThemeToggle className="hidden md:inline-flex" />
          <LandingAuthActions className="h-8 px-3 text-[10px] md:h-9 md:px-4 md:text-xs" />
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={t("nav.menu")}
            aria-expanded={menuOpen}
            aria-controls="landing-menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </Button>
        </div>
      </div>

      {/* Panel menu mobile — trượt xuống dưới header */}
      <AnimatePresence initial={false}>
        {menuOpen && (
          <motion.div
            id="landing-menu"
            key="menu"
            {...menuPanel(reduce)}
            className="overflow-hidden border-t border-border/60 md:hidden"
          >
            <nav className="flex flex-col px-4 py-2">
              {NAV_LINKS.map((link, i) => (
                <motion.div
                  key={link.key}
                  {...menuItem(i, reduce)}
                  className="border-b border-border/60 last:border-b-0"
                >
                  {renderLink(
                    link,
                    "block py-3.5 font-mono text-sm uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground",
                  )}
                </motion.div>
              ))}
            </nav>
            <div className="flex items-center justify-center gap-2 border-t border-border/60 px-4 py-3">
              <LanguageToggle className="inline-flex" />
              <ThemeToggle className="inline-flex" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
