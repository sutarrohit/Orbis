import { createRoute } from "@hono/zod-openapi";
import { OK } from "stoker/http-status-codes";
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers";
import { createErrorSchema } from "stoker/openapi/schemas";
import { createRouter } from "../../lib/create-app.js";
import { requireAuth } from "../../middlewares/index.js";
import { protectedSecurity } from "../../schemas/common.schema.js";
import {
  SchedulerConfigSchema,
  UpdateSchedulerConfigSchema,
} from "../../schemas/scheduler-config.schema.js";
import * as schedulerConfigService from "../../services/scheduler-config.service.js";

const tags = ["Scheduler Config"];

// Global (not per-brand) config, so only auth is required — no requireBrand.
const getSchedulerConfig = createRoute({
  method: "get",
  path: "/scheduler-config",
  tags,
  security: protectedSecurity,
  summary: "Read the global autonomous-scheduler config",
  responses: {
    [OK]: jsonContent(SchedulerConfigSchema, "The scheduler config"),
  },
});

const updateSchedulerConfig = createRoute({
  method: "put",
  path: "/scheduler-config",
  tags,
  security: protectedSecurity,
  summary: "Update the global autonomous-scheduler config",
  request: {
    body: jsonContentRequired(UpdateSchedulerConfigSchema, "Fields to update"),
  },
  responses: {
    [OK]: jsonContent(SchedulerConfigSchema, "The updated config"),
    [422]: jsonContent(createErrorSchema(UpdateSchedulerConfigSchema), "Validation error"),
  },
});

const router = createRouter();
router.use("*", requireAuth);

export const schedulerConfigRouter = router
  .openapi(getSchedulerConfig, async (c) => {
    const config = await schedulerConfigService.getSchedulerConfig();
    return c.json(config, OK);
  })
  .openapi(updateSchedulerConfig, async (c) => {
    const config = await schedulerConfigService.updateSchedulerConfig(c.req.valid("json"));
    return c.json(config, OK);
  });
