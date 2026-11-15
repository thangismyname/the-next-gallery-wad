import { createProfileService } from "@tng/shared";
import { webHttp } from "@/lib/http.web";

export const {
  fetchProfileStats,
  fetchStorageBreakdown,
} = createProfileService(webHttp);
