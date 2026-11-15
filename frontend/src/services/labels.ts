import { createLabelsService } from "@tng/shared";
import { webHttp } from "@/lib/http.web";

export const {
  fetchLabels,
  seedLabels,
  createLabel,
  updateLabel,
  deleteLabel,
  setLabelMedia,
  fetchMediaLabels,
  fetchSaved,
} = createLabelsService(webHttp);
