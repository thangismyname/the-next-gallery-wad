import { createNotificationsService } from "@tng/shared";
import { webHttp } from "@/lib/http.web";

export const notificationsApi = createNotificationsService(webHttp);
