import { createAiProcessingService } from "@tng/shared";
import { webHttp } from "@/lib/http.web";

export const {
  fetchAiStatus,
  runAiBackfillBatch,
} = createAiProcessingService(webHttp);
