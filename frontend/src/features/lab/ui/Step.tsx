// Tiêu đề 1 bước (số + tên + câu hỏi) và khối bước.
import { useTranslation } from "react-i18next";

/** Tiêu đề 1 bước: số thứ tự lớn + tên + câu hỏi. */
export function StepHeader({ index, title, question }: { index?: number; title: string; question?: string }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-border/60 pb-2">
      {index != null && <span className="font-heading text-2xl text-muted-foreground tabular-nums">{index}</span>}
      <div>
        <h2 className="font-heading text-lg">{title}</h2>
        {question && <p className="text-xs text-muted-foreground">{question}</p>}
      </div>
    </div>
  );
}

/** 1 bước của tóm tắt: StepHeader (i18n `<base>.title` / `<base>.question`) + nội dung. */
export function Step({
  index,
  base,
  params,
  children,
}: {
  index: number;
  base: string;
  params?: Record<string, unknown>;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section className="space-y-3">
      <StepHeader index={index} title={t(`${base}.title`)} question={t(`${base}.question`, params ?? {})} />
      {children}
    </section>
  );
}
