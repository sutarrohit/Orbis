import { createRoute } from "@hono/zod-openapi";
import { OK } from "stoker/http-status-codes";
import { jsonContent } from "stoker/openapi/helpers";
import { createRouter } from "../../lib/create-app.js";
import { requireAuth, requireBrand } from "../../middlewares/index.js";
import { protectedSecurity } from "../../schemas/common.schema.js";
import { UsageQuery, UsageSchema } from "../../schemas/usage.schema.js";
import * as usageService from "../../services/usage.service.js";

const getUsage = createRoute({
  method: "get",
  path: "/usage",
  tags: ["Usage"],
  security: protectedSecurity,
  summary: "Token-usage summary over a time window",
  request: { query: UsageQuery },
  responses: {
    [OK]: jsonContent(UsageSchema, "Aggregated token usage")
  }
});

const router = createRouter();
router.use("*", requireAuth, requireBrand);

export const usageRouter = router.openapi(getUsage, async (c) => {
  const { days } = c.req.valid("query");
  const usage = await usageService.getUsage(c.get("brand").id, days);
  return c.json(usage, OK);
});
