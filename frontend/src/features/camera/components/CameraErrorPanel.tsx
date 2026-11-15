import { useTranslation } from "react-i18next";
import { RotateCcw } from "lucide-react";
import type { CameraError } from "@tng/shared";

const CameraErrorPanel: React.FC<{
  error: CameraError;
  onRetry: () => void;
}> = ({ error, onRetry }) => {
  const { t } = useTranslation();
  const denied = error === "denied";

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="grid size-14 place-items-center rounded-full bg-white/10 text-red-400">
        <RotateCcw className="size-6" />
      </div>
      <div className="space-y-1">
        <h2 className="text-base font-semibold">
          {t(denied ? "camera.permissionDenied" : "camera.unsupported")}
        </h2>
        <p className="max-w-sm text-sm text-white/60">
          {t(denied ? "camera.permissionDeniedHint" : "camera.unsupportedHint")}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-white/90"
      >
        <RotateCcw className="size-4" />
        {t("camera.retry")}
      </button>
    </div>
  );
};

export default CameraErrorPanel;