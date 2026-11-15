import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useCamera } from "@/features/camera/useCamera";
import { useSwipeUp } from "@/features/camera/useSwipeUp";
import { usePinchZoom } from "@/features/camera/usePinchZoom";
import { cn } from "@/lib/utils";
import CameraTopBar from "./components/CameraTopBar";
import CameraSettingsBar from "./components/CameraSettingsBar";
import CameraViewfinder from "./components/CameraViewfinder";
import CameraControls from "./components/CameraControls";
import CameraZoomChips from "./components/CameraZoomChips";

export const CameraView: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const camera = useCamera({ initialMode: params.get("mode") === "moments" ? "moments" : undefined });
  const {
    mode,
    setMode,
    mirror,
    setMirror,
    aspectRatio,
    setAspectRatio,
    showGrid,
    toggleGrid,
    timerDelay,
    cycleTimer,
    countdown,
    showSettings,
    setShowSettings,
    ready,
    error,
    retry,
    recording,
    timer,
    preview,
    saving,
    saved,
    saveError,
    videoRef,
    vfBoxRef,
    vfSize,
    flipCamera,
    canFlip,
    zoomRange,
    zoom,
    setZoom,
    torchSupported,
    torch,
    toggleTorch,
    flashKey,
    handleShutterDown,
    handleShutterUp,
    handleShutterCancel,
    resetPreview,
    savePreview,
  } = camera;

  const exit = () =>
    window.history.length > 1 ? navigate(-1) : navigate("/gallery");

  // Vuốt lên từ vùng camera → mở Thư viện
  const swipeUp = useSwipeUp(() => {
    if (recording || preview || saving) return;
    navigate("/gallery");
  });

  // Phím tắt desktop — đọc state mới nhất qua ref (listener gắn 1 lần).
  const latest = useRef({ camera, exit });
  latest.current = { camera, exit };
  useEffect(() => {
    const typing = (e: KeyboardEvent) =>
      (e.target as HTMLElement | null)?.closest("input, textarea, select");
    const onDown = (e: KeyboardEvent) => {
      if (typing(e)) return;
      const { camera: c, exit: leave } = latest.current;
      if (e.repeat) return;
      if (c.preview) {
        // Xem lại: Enter = lưu, Esc = chụp lại.
        if (e.key === "Enter" && !c.saving && !c.saved) {
          e.preventDefault();
          void c.savePreview();
        } else if (e.key === "Escape" && !c.saving) c.resetPreview();
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        c.shutterPress();
      } else if (e.key === "f" || e.key === "F") {
        c.flipCamera();
      } else if (e.key === "g" || e.key === "G") {
        c.toggleGrid();
      } else if (e.key === "Escape") {
        if (c.showSettings) c.setShowSettings(false);
        else if (!c.recording) leave();
      } else if (c.zoomRange && (e.key === "+" || e.key === "=")) {
        c.setZoom(c.zoom + 0.5);
      } else if (c.zoomRange && e.key === "-") {
        c.setZoom(c.zoom - 0.5);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if ((e.key === " " || e.key === "Enter") && !typing(e)) {
        latest.current.camera.handleShutterUp();
      }
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  const busy = recording || countdown > 0;
  const pinch = usePinchZoom(!!zoomRange && !preview, zoom, setZoom);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black text-white select-none wide:flex-row"
      {...swipeUp}
    >
      {/* Sân khấu: khung ngắm + lớp nổi (thanh trên, cài đặt, xem lại) */}
      <div
        className={cn("relative min-h-0 min-w-0 flex-1", zoomRange && "touch-none")}
        {...pinch}
      >
        <CameraViewfinder
          error={error}
          onRetry={retry}
          ready={ready}
          videoRef={videoRef}
          vfBoxRef={vfBoxRef}
          vfSize={vfSize}
          aspectRatio={aspectRatio}
          mirror={mirror}
          showGrid={showGrid}
          countdown={countdown}
          recording={recording}
          timer={timer}
          preview={preview}
          saved={saved}
          saving={saving}
          saveError={saveError}
          flashKey={flashKey}
          onReset={resetPreview}
          onSave={savePreview}
        />

        {!preview && (
          <CameraTopBar
            onBack={exit}
            showSettings={showSettings}
            disabled={busy}
            onToggleSettings={() => setShowSettings((s) => !s)}
            aspectRatio={aspectRatio}
            timerDelay={timerDelay}
            torchSupported={torchSupported}
            torch={torch}
            onToggleTorch={toggleTorch}
          />
        )}

        {zoomRange && ready && !error && !preview && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center">
            <CameraZoomChips range={zoomRange} zoom={zoom} onZoom={setZoom} />
          </div>
        )}

        {showSettings && !preview && !busy && (
          <CameraSettingsBar
            aspectRatio={aspectRatio}
            onAspectChange={setAspectRatio}
            showGrid={showGrid}
            onGridToggle={toggleGrid}
            timerDelay={timerDelay}
            onTimerToggle={cycleTimer}
            mirror={mirror}
            onMirrorToggle={() => setMirror((m) => !m)}
          />
        )}
      </div>

      {!preview && (
        <CameraControls
          mode={mode}
          onModeChange={setMode}
          recording={recording}
          countdown={countdown}
          timerDelay={timerDelay}
          timer={timer}
          onFlip={flipCamera}
          canFlip={canFlip}
          onShutterDown={handleShutterDown}
          onShutterUp={handleShutterUp}
          onShutterCancel={handleShutterCancel}
        />
      )}
    </div>
  );
};
