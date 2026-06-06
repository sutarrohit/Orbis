import { createRoute, z } from "@hono/zod-openapi";
import { OK } from "stoker/http-status-codes";
import { jsonContent } from "stoker/openapi/helpers";
import { createRouter } from "../../lib/create-app.js";
import { requireAuth, requireBrand } from "../../middlewares/index.js";
import { protectedSecurity } from "../../schemas/common.schema.js";
import { ActivitySchema, ListActivityQuery } from "../../schemas/activity.schema.js";
import * as activityService from "../../services/activity.service.js";

const listActivity = createRoute({
  method: "get",
  path: "/activity",
  tags: ["Activity"],
  security: protectedSecurity,
  summary: "Unified agent activity feed",
  request: { query: ListActivityQuery },
  responses: {
    [OK]: jsonContent(z.array(ActivitySchema), "Recent activity (secrets redacted)")
  }
});

const router = createRouter();
router.use("*", requireAuth, requireBrand);

export const activityRouter = router.openapi(listActivity, async (c) => {
  const rows = await activityService.listActivity(c.get("brand").id, c.req.valid("query"));
  return c.json(rows, OK);
});
