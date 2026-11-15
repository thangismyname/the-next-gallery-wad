import { createDeveloperService } from "@tng/shared";
import { webHttp } from "@/lib/http.web";

export const {
  fetchDeveloperStatus,
  requestDeveloper,
  fetchAdminDeveloperRequests,
  reviewDeveloperRequest,
} = createDeveloperService(webHttp);
