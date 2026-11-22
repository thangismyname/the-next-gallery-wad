import { createImportsService } from "@tng/shared";
import { webHttp } from "@/lib/http.web";

export const importsApi = createImportsService(webHttp);
