import { z } from "zod";

export const notificationParamsSchema = z.object({ id: z.uuid() });
