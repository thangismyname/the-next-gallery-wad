import React from "react";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClassificationPanel } from "./components/ClassificationPanel";

/**
 * AI Studio: nơi trình diễn 2 phần AI của đề tài — Phân loại (tag nội dung +
 * độ tin cậy) và Chỉnh sửa (preset / LUT, chưa làm).
 */
export const StudioView: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <div className="flex aspect-square size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="size-5" />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            {t("studio.title")}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t("studio.subtitle")}
          </p>
        </div>
      </div>

      <Tabs defaultValue="classify">
        <TabsList className="mb-4">
          <TabsTrigger value="classify">{t("studio.tabClassify")}</TabsTrigger>
          <TabsTrigger value="edit" disabled className="gap-1.5">
            {t("studio.tabEdit")}
            <Badge variant="outline" className="px-1.5 text-[10px]">
              {t("studio.comingSoon")}
            </Badge>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="classify">
          <ClassificationPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
};
