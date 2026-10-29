import { useTranslation } from "react-i18next";
import { ArrowUpRight } from "lucide-react";
import { Reveal, RevealGroup, RevealItem } from "./Reveal";
import { CountUp } from "@/components/motion/effects";

// Đúng các tính năng app đang có — mỗi dòng: tên · mô tả · mô hình đứng sau.
const CAPABILITIES = [
  { key: "semanticSearch", model: "CLIP · YOLO26" },
  { key: "objectDetection", model: "YOLO26" },
  { key: "visualSimilarity", model: "DINOv3" },
  { key: "autoClassification", model: "CLIP probe" },
  { key: "smartAlbums", model: "Hybrid search" },
  { key: "sharing", model: "WebRTC" },
];

// Số liệu nhanh (giá trị cố định của hệ thống, nhãn dịch theo ngôn ngữ).
const STATS = [
  { value: "3", key: "models" },
  { value: "17", key: "tags" },
  { value: "80", key: "objects" },
  { value: "3", key: "languages" },
];

export function CapabilitiesList() {
  const { t } = useTranslation();

  return (
    <section id="capabilities" className="border-t border-border/60">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 py-16 md:grid-cols-[1fr_1.6fr] md:py-24">
        <Reveal className="md:sticky md:top-28 md:self-start">
          <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            {t("capabilities.pipelineTitle")}
          </h3>
          <p className="mt-4 max-w-sm font-heading text-2xl leading-snug md:text-3xl">
            {t("capabilities.pipelineHeadline")}
          </p>
          <p className="mt-4 max-w-sm font-sans text-sm text-muted-foreground">
            {t("capabilities.pipelineBody")}
          </p>

          <RevealGroup
            as="dl"
            stagger={0.08}
            className="mt-10 grid max-w-sm grid-cols-2 gap-px bg-border/60"
          >
            {STATS.map(({ value, key }) => (
              <RevealItem key={key} className="bg-background p-4">
                <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {t(`capabilities.stats.${key}`)}
                </dt>
                <dd className="mt-1 font-heading text-3xl">
                  <CountUp value={value} />
                </dd>
              </RevealItem>
            ))}
          </RevealGroup>
        </Reveal>

        <RevealGroup as="ol" stagger={0.07} className="border-t border-border/60">
          {CAPABILITIES.map(({ key, model }, i) => (
            <RevealItem
              as="li"
              key={key}
              className="group relative isolate grid grid-cols-[2.5rem_1fr] gap-x-4 border-b border-border/60 py-6 transition-[padding] duration-500 ease-out before:absolute before:inset-y-0 before:-left-4 before:-right-4 before:-z-10 before:origin-left before:scale-x-0 before:bg-muted/50 before:transition-transform before:duration-500 before:ease-out hover:pl-2 hover:before:scale-x-100 md:grid-cols-[3rem_1fr_auto]"
            >
              <span className="font-mono text-xs text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h4 className="flex items-center gap-1.5 font-mono text-sm uppercase tracking-widest transition-colors group-hover:text-primary">
                  {t(`capabilities.${key}`)}
                  <ArrowUpRight className="size-3.5 -translate-x-1 translate-y-1 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100" />
                </h4>
                <p className="mt-2 max-w-md font-sans text-sm text-muted-foreground">
                  {t(`capabilities.desc.${key}`)}
                </p>
              </div>
              <span className="col-start-2 mt-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground md:col-start-3 md:mt-0">
                {model}
              </span>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
