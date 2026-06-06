import { createRoute, z } from "@hono/zod-openapi";
import { OK } from "stoker/http-status-codes";
import { jsonContent } from "stoker/openapi/helpers";
import { createRouter } from "../../lib/create-app.js";
import { requireAuth, requireBrand } from "../../middlewares/index.js";
import { protectedSecurity } from "../../schemas/common.schema.js";
import { LearningSchema } from "../../schemas/learnings.schema.js";
import * as learningsService from "../../services/learnings.service.js";

const listLearnings = createRoute({
  method: "get",
  path: "/learnings",
  tags: ["Learnings"],
  security: protectedSecurity,
  summary: "List the brand's strategy learnings",
  responses: {
    [OK]: jsonContent(z.array(LearningSchema), "The brand's learnings")
  }
});

const router = createRouter();
router.use("*", requireAuth, requireBrand);

export const learningsRouter = router.openapi(listLearnings, async (c) => {
  const learnings = await learningsService.listLearnings(c.get("brand").id);
  return c.json(learnings, OK);
});
