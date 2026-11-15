// hooks/useDeveloperMode.ts
// Store toàn cục cho Developer Mode — nhiều nơi cần biết (UserMenu, Lightbox...),
// nên state nằm trong zustand. `enabled` (công tắc người dùng) persist vào
// localStorage; `status` lấy từ backend (developer_requests) và cache trong store.
import { type DeveloperStatus } from "@tng/shared";
import { useCallback, useEffect } from "react";
import { create } from "zustand";
import { fetchDeveloperStatus, requestDeveloper } from "@/services/developer";

const ENABLED_STORAGE_KEY = "tng.devModeEnabled";

interface DeveloperState {
  status: DeveloperStatus;
  loaded: boolean;
  enabled: boolean;
  setStatus: (status: DeveloperStatus) => void;
  setLoaded: (loaded: boolean) => void;
  setEnabled: (enabled: boolean) => void;
}

function readStoredEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export const useDeveloperModeStore = create<DeveloperState>((set) => ({
  status: "none",
  loaded: false,
  enabled: readStoredEnabled(),
  setStatus: (status) => set({ status }),
  setLoaded: (loaded) => set({ loaded }),
  setEnabled: (enabled) => {
    try {
      localStorage.setItem(ENABLED_STORAGE_KEY, String(enabled));
    } catch {
      /* localStorage có thể bị chặn — bỏ qua */
    }
    set({ enabled });
  },
}));

export function useDeveloperMode() {
  const status = useDeveloperModeStore((s) => s.status);
  const loaded = useDeveloperModeStore((s) => s.loaded);
  const enabled = useDeveloperModeStore((s) => s.enabled);
  const setStatus = useDeveloperModeStore((s) => s.setStatus);
  const setLoaded = useDeveloperModeStore((s) => s.setLoaded);
  const setEnabled = useDeveloperModeStore((s) => s.setEnabled);

  const refresh = useCallback(async () => {
    try {
      const result = await fetchDeveloperStatus();
      setStatus(result.status);
    } catch {
      setStatus("none");
    } finally {
      setLoaded(true);
    }
  }, [setStatus, setLoaded]);

  useEffect(() => {
    if (!loaded) refresh();
  }, [loaded, refresh]);

  const isDeveloper = status === "approved";
  const devModeEnabled = isDeveloper && enabled;

  const apply = useCallback(
    async (message?: string) => {
      const result = await requestDeveloper(message);
      setStatus(result.status);
      setLoaded(true);
      return result;
    },
    [setStatus, setLoaded],
  );

  const toggle = useCallback(
    (value?: boolean) => {
      if (!isDeveloper) return;
      setEnabled(value ?? !enabled);
    },
    [isDeveloper, enabled, setEnabled],
  );

  return {
    status,
    loaded,
    isDeveloper,
    devModeEnabled,
    enabled,
    refresh,
    request: apply,
    toggle,
  };
}
