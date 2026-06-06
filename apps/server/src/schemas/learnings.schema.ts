import { z } from "@hono/zod-openapi";
import { dateField } from "./common.schema.js";

export const LearningSchema = z
  .object({
    id: z.string().uuid(),
    brandId: z.string().uuid(),
    text: z.string(),
    createdAt: dateField()
  })
  .openapi("Learning");
