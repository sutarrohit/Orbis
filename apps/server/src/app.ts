import createApp from "./lib/create-app.js";
import { configureOpenAPI } from "./lib/configure-open-api.js";
import { auth } from "./lib/auth.js";
import { brandRouter } from "./routes/brand/index.js";
import { accountsRouter } from "./routes/accounts/index.js";
import { communitiesRouter } from "./routes/communities/index.js";
import { leadsRouter } from "./routes/leads/index.js";
import { groupMembersRouter } from "./routes/group-members/index.js";
import { conversationsRouter } from "./routes/conversations/index.js";
import { activityRouter } from "./routes/activity/index.js";
import { learningsRouter } from "./routes/learnings/index.js";
import { usageRouter } from "./routes/usage/index.js";
import { agentStateRouter } from "./routes/agent-state/index.js";
import { agentsRouter } from "./routes/agents/index.js";

import type { Context } from "hono";
import type { AppBinding } from "./lib/types.js";

const app = createApp();
configureOpenAPI(app);

app.get("/health", (c: Context<AppBinding>) => {
  return c.json({
    status: "ok"
  });
});

// Better Auth owns every route under /api/auth/* (sign-in, sign-up, OAuth
// callbacks, session, etc.). Hand the raw request straight to its handler.
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// Versioned feature routes (Group A — DB-backed CRUD).
const v1 = [
  brandRouter,
  accountsRouter,
  communitiesRouter,
  leadsRouter,
  groupMembersRouter,
  conversationsRouter,
  activityRouter,
  learningsRouter,
  usageRouter,
  agentStateRouter,
  agentsRouter
] as const;
for (const router of v1) {
  app.route("/api/v1", router);
}

export type AppType = typeof app;
export default app;
