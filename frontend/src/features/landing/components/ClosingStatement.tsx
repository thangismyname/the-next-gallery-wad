import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLandingCta } from "../useLandingCta";
import { Reveal } from "./Reveal";
import { ScrollWords } from "@/components/motion/effects";

export function ClosingStatement() {
  const { t } = useTranslation();
  const { isAuthenticated, go } = useLandingCta();

  return (
    <section className="border-t border-border/60">
      <Reveal className="mx-auto max-w-7xl px-6 py-16 md:py-28">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
          {t("closing.eyebrow")}
        </p>
        {/* Câu lớn sáng dần từng chữ theo cuộn */}
        <ScrollWords
          text={t("closing.statement")}
          className="mt-6 max-w-5xl font-heading text-3xl leading-tight md:text-6xl"
        />
        <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
          <Button
            onClick={go}
            className="group w-fit rounded-none font-mono text-xs uppercase tracking-widest"
          >
            {isAuthenticated ? t("nav.openGallery") : t("closing.cta")}
            <ArrowRight className="ml-2 h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
          </Button>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("closing.note")}
          </span>
        </div>
      </Reveal>
    </section>
  );
}
