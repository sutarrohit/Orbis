import { createRoute, z } from "@hono/zod-openapi";
import { OK } from "stoker/http-status-codes";
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers";
import { createErrorSchema } from "stoker/openapi/schemas";
import { createRouter } from "../../lib/create-app.js";
import { requireAuth, requireBrand } from "../../middlewares/index.js";
import { protectedSecurity } from "../../schemas/common.schema.js";
import { AgentConfigSchema, UpsertAgentConfigSchema } from "../../schemas/agent-config.schema.js";
import * as agentConfigService from "../../services/agent-config.service.js";

const tags = ["Agent Config"];

const listAgentConfigs = createRoute({
  method: "get",
  path: "/agent-config",
  tags,
  security: protectedSecurity,
  summary: "List the brand's per-agent configs",
  responses: {
    [OK]: jsonContent(z.array(AgentConfigSchema), "Per-agent configuration")
  }
});

const upsertAgentConfig = createRoute({
  method: "post",
  path: "/agent-config",
  tags,
  security: protectedSecurity,
  summary: "Create or update one agent's config",
  request: {
    body: jsonContentRequired(UpsertAgentConfigSchema, "Config to upsert (keyed by agentType)")
  },
  responses: {
    [OK]: jsonContent(AgentConfigSchema, "The upserted config"),
    [422]: jsonContent(createErrorSchema(UpsertAgentConfigSchema), "Validation error")
  }
});

const router = createRouter();
router.use("*", requireAuth, requireBrand);

export const agentConfigRouter = router
  .openapi(listAgentConfigs, async (c) => {
    const configs = await agentConfigService.listAgentConfigs(c.get("brand").id);
    return c.json(configs, OK);
  })
  .openapi(upsertAgentConfig, async (c) => {
    const config = await agentConfigService.upsertAgentConfig(c.get("brand").id, c.req.valid("json"));
    return c.json(config, OK);
  });
