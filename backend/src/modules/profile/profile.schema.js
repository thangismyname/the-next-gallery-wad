import { z } from "zod";

export const avatarParamsSchema = z.object({ mediaId: z.string().uuid() });
