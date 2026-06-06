import { createRoute, z } from "@hono/zod-openapi";
import { OK } from "stoker/http-status-codes";
import { jsonContent } from "stoker/openapi/helpers";
import { createRouter } from "../../lib/create-app.js";
import { requireAuth, requireBrand } from "../../middlewares/index.js";
import { protectedSecurity } from "../../schemas/common.schema.js";
import { AgentStateSchema } from "../../schemas/agent-state.schema.js";
import * as agentStateService from "../../services/agent-state.service.js";

const listAgentStates = createRoute({
  method: "get",
  path: "/agent-state",
  tags: ["Agent State"],
  security: protectedSecurity,
  summary: "Run status of the brand's agents",
  responses: {
    [OK]: jsonContent(z.array(AgentStateSchema), "Per-agent run state")
  }
});

const router = createRouter();
router.use("*", requireAuth, requireBrand);

export const agentStateRouter = router.openapi(listAgentStates, async (c) => {
  const states = await agentStateService.listAgentStates(c.get("brand").id);
  return c.json(states, OK);
});
