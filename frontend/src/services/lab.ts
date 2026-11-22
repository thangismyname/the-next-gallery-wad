import { createLabService } from "@tng/shared";
import { webHttp } from "@/lib/http.web";

export const {
  fetchLabExperiments,
  fetchLabRun,
  fetchLabFile,
  fetchLabHistory,
  fetchLabRunner,
  fetchLabRunnerSchema,
  fetchLabJob,
  planLabSuite,
  startLabJob,
  cancelLabJob,
  deleteLabRun,
} = createLabService(webHttp);
