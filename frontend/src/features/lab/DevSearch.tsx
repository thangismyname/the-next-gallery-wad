import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FlaskConical, LayoutDashboard, ShieldCheck, type LucideIcon } from "lucide-react";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { SearchTrigger } from "@/features/search/components/SearchTrigger";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { useSession } from "@/services/authClient";
import { useLabExperiments } from "./useLab";

/** Tìm nhanh trong khu Developer (⌘K): experiment (tên + mô tả ngắn) và chuyển trang — như AdminSearch. */
export function DevSearch() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const isAdmin = useSession().data?.user.role === "admin";
  const toggle = useCallback(() => setOpen((v) => !v), []);
  useKeyboardShortcut({ key: "k" }, toggle);
  const { data } = useLabExperiments();

  const needle = text.trim().toLowerCase();
  const match = (...parts: string[]) => !needle || parts.some((p) => p.toLowerCase().includes(needle));
  const experiments = (data?.experiments ?? []).filter((e) =>
    match(e.exp, t(`lab.exp.${e.exp}.short`, { defaultValue: "" })),
  );
  const pages: { label: string; to: string; icon: LucideIcon }[] = [
    { label: t("lab.overview.tab"), to: "/dev/lab", icon: LayoutDashboard },
    ...(isAdmin ? [{ label: t("admin.switch"), to: "/admin", icon: ShieldCheck }] : []),
    { label: t("admin.header.backToApp"), to: "/gallery", icon: ArrowLeft },
  ].filter((p) => match(p.label));

  const go = (to: string) => {
    setOpen(false);
    setText("");
    navigate(to);
  };

  return (
    <>
      <SearchTrigger onOpen={() => setOpen(true)} />
      <CommandDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setText("");
        }}
        title={t("header.search")}
        description={t("dev.search.placeholder")}
      >
        <Command shouldFilter={false}>
          <CommandInput value={text} onValueChange={setText} placeholder={t("dev.search.placeholder")} />
          <CommandList className="max-h-[60vh]">
            <CommandEmpty>{t("admin.search.empty")}</CommandEmpty>
            {experiments.length > 0 && (
              <CommandGroup heading={t("dev.search.experiments")}>
                {experiments.map((e) => (
                  <CommandItem key={e.exp} value={`exp-${e.exp}`} onSelect={() => go(`/dev/lab?exp=${encodeURIComponent(e.exp)}`)}>
                    <FlaskConical className="size-4" />
                    <span className="font-mono">{e.exp}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {t(`lab.exp.${e.exp}.short`, { defaultValue: "" })}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {pages.length > 0 && (
              <CommandGroup heading={t("admin.search.pages")}>
                {pages.map(({ label, to, icon: Icon }) => (
                  <CommandItem key={to} value={`page-${to}`} onSelect={() => go(to)}>
                    <Icon className="size-4" />
                    {label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
