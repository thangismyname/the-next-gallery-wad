import { useTranslation } from "react-i18next";
import { AlertCircle, Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CameraPreview as PreviewData } from "@tng/shared";

type Props = {
  preview: PreviewData;
  saved: boolean;
  saving: boolean;
  /** i18n key của lỗi lưu / đăng moment (null = không lỗi). */
  error: string | null;
  onReset: () => void;
  onSave: () => void;
};

const CameraPreview: React.FC<Props> = ({
  preview,
  saved,
  saving,
  error,
  onReset,
  onSave,
}) => {
  const { t } = useTranslation();
  const isVideo = preview.kind === "video";
  const isMoment = preview.mode === "moments";

  return (
    <div className={cn("absolute inset-0 z-10 flex flex-col bg-black")}>
      <div className="flex min-h-0 flex-1 items-center justify-center px-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
        {isVideo ? (
          <video
            src={preview.url}
            autoPlay
            loop
            playsInline
            controls
            className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
          />
        ) : (
          <img
            src={preview.url}
            alt={t("camera.title")}
            className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
          />
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full bg-red-500/15 px-4 py-2 text-sm text-red-300 animate-in fade-in slide-in-from-bottom-1"
        >
          <AlertCircle className="size-4 shrink-0" />
          {t(error)}
        </p>
      )}
      <div className="flex shrink-0 items-center justify-center gap-4 px-6 pt-5 pb-[max(env(safe-area-inset-bottom),1.5rem)] sm:gap-6">
        <button
          type="button"
          onClick={onReset}
          disabled={saving}
          className="grid size-14 place-items-center rounded-full border-2 border-white/40 text-white/80 transition hover:border-white/80 hover:text-white disabled:opacity-40"
          aria-label={t("camera.retake")}
          title={t("camera.retake")}
        >
          <X className="size-6" />
        </button>
        {saved ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-6 py-3 font-medium text-emerald-300">
            <Check className="size-5" />
            {t(isMoment ? "camera.savedMoment" : "camera.saved")}
          </span>
        ) : (
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-6 py-3 font-semibold text-black transition disabled:opacity-60 sm:px-8",
              // Moment = rose, like the mobile review's "Post to Moments".
              isMoment ? "bg-rose-400 hover:bg-rose-300" : "bg-white hover:bg-white/90",
            )}
          >
            {saving ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <Check className="size-5" />
            )}
            {saving ? t("camera.saving") : t(isMoment ? "camera.saveMoment" : "camera.save")}
          </button>
        )}
      </div>
    </div>
  );
};

export default CameraPreview;