import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DeveloperStatusResult } from "@tng/shared";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { developerApi } from "@/services";

export const developerStatusQueryKey = ["developer", "status"] as const;

/** The user's own on/off switch (web localStorage `tng.devModeEnabled`), remembered across launches. */
const useDevSwitch = create<{ enabled: boolean; setEnabled: (enabled: boolean) => void }>()(
  persist((set) => ({ enabled: false, setEnabled: (enabled) => set({ enabled }) }), {
    name: "tng.devModeEnabled",
    storage: createJSONStorage(() => AsyncStorage),
  }),
);

/**
 * Developer Mode (web `hooks/useDeveloperMode.ts`): request → admin approves →
 * the user can switch it on. On = YOLO bounding boxes over the Lightbox photo.
 * `status` comes from `/developer/status` (React Query), the switch is local.
 */
export function useDeveloperMode() {
  const queryClient = useQueryClient();
  const enabled = useDevSwitch((s) => s.enabled);
  const setEnabled = useDevSwitch((s) => s.setEnabled);
  const query = useQuery({
    queryKey: developerStatusQueryKey,
    queryFn: developerApi.fetchDeveloperStatus,
    staleTime: 5 * 60_000,
  });
  const status = query.data?.status ?? "none";
  const isDeveloper = status === "approved";
  const request = useMutation({
    mutationFn: (message?: string) => developerApi.requestDeveloper(message),
    onSuccess: (result: DeveloperStatusResult) => queryClient.setQueryData(developerStatusQueryKey, result),
  });
  return {
    status,
    loaded: !query.isPending,
    isDeveloper,
    enabled,
    devModeEnabled: isDeveloper && enabled,
    setEnabled: (value: boolean) => {
      if (isDeveloper) setEnabled(value);
    },
    request,
    refresh: query.refetch,
  };
}
