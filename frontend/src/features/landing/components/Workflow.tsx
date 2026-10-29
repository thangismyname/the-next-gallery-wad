import { useTranslation } from "react-i18next";
import { motion, useReducedMotion } from "framer-motion";
import { Reveal, RevealGroup, RevealItem } from "./Reveal";
import { drawLine } from "../landing.motion";

const STEPS = ["upload", "analyze", "find"] as const;

/** 3 bước: tải lên → AI phân tích 1 lần → tìm & sắp xếp tức thì. */
export function Workflow() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();

  return (
    <section id="workflow" className="border-t border-border/60">
      <div className="mx-auto max-w-7xl px-6 py-16 md:py-24">
        <Reveal className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              {t("workflow.eyebrow")}
            </h3>
            <p className="mt-4 max-w-xl font-heading text-3xl leading-tight md:text-5xl">
              {t("workflow.title")}
            </p>
          </div>
          <p className="max-w-sm font-sans text-sm text-muted-foreground">
            {t("workflow.subtitle")}
          </p>
        </Reveal>

        {/* Vạch tiến trình "vẽ" từ trái sang phải khi cuộn tới — nối 3 bước */}
        <motion.div
          aria-hidden
          {...drawLine(reduce)}
          className="mt-12 h-px origin-left bg-foreground"
        />
        <RevealGroup as="ol" stagger={0.15} className="grid gap-px bg-border/60 md:grid-cols-3">
          {STEPS.map((key, i) => (
            <RevealItem
              as="li"
              key={key}
              className="group flex min-h-64 flex-col bg-background p-6 transition-colors duration-500 hover:bg-muted/40 md:p-8"
            >
              <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                {String(i + 1).padStart(2, "0")} ·{" "}
                {t(`workflow.steps.${key}.label`)}
              </span>
              <h4 className="mt-auto pt-10 font-heading text-2xl transition-transform duration-500 ease-out group-hover:-translate-y-1">
                {t(`workflow.steps.${key}.title`)}
              </h4>
              <p className="mt-3 font-sans text-sm text-muted-foreground">
                {t(`workflow.steps.${key}.desc`)}
              </p>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
