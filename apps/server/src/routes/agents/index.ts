import { createRoute } from "@hono/zod-openapi";
import type { Context } from "hono";
import { BAD_GATEWAY, NO_CONTENT, OK } from "stoker/http-status-codes";
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers";
import { createRouter } from "../../lib/create-app.js";
import { requireAuth, requireBrand } from "../../middlewares/index.js";
import type { AppBinding } from "../../lib/types.js";
import { ErrorSchema, protectedSecurity } from "../../schemas/common.schema.js";
import {
  AccountIdParamsSchema,
  AgentAccountListSchema,
  AgentAccountViewSchema,
  AgentRunResultSchema,
  ConnectDiscordInputSchema,
  DecideContextSchema,
  DecideQuerySchema,
  LeaderRunInputSchema,
  LoginStepResultSchema,
  RecordListSchema,
  ResearchRunInputSchema,
  SchedulerActionParamsSchema,
  SchedulerStatusSchema,
  SearchRunInputSchema,
  SearchRunResultSchema,
  SendCodeInputSchema,
  SetAccountStatusInputSchema,
  VerifyCodeInputSchema,
  VerifyPasswordInputSchema
} from "../../schemas/agents.schema.js";
import * as agentsService from "../../services/agents.service.js";

const tags = ["Agents"];
const upstreamError = { [BAD_GATEWAY]: jsonContent(ErrorSchema, "Agent service unavailable") };

const ctxOf = (c: Context<AppBinding>) => ({
  brandId: c.get("brand").id,
  userId: c.get("user").id,
  niche: c.get("brand").niche
});

// ─── Agent runs ──────────────────────────────────────────────────────────────

const runSearch = createRoute({
  method: "post",
  path: "/agents/search/run",
  tags,
  security: protectedSecurity,
  summary: "Run the Search agent once",
  request: { body: jsonContentRequired(SearchRunInputSchema, "Search run options") },
  responses: { [OK]: jsonContent(SearchRunResultSchema, "Search run summary"), ...upstreamError }
});

const runResearch = createRoute({
  method: "post",
  path: "/agents/research/run",
  tags,
  security: protectedSecurity,
  summary: "Run the Research agent once",
  request: { body: jsonContentRequired(ResearchRunInputSchema, "Research run options") },
  responses: { [OK]: jsonContent(AgentRunResultSchema, "Research run result"), ...upstreamError }
});

const runLeader = createRoute({
  method: "post",
  path: "/agents/leader/run",
  tags,
  security: protectedSecurity,
  summary: "Run one Leader cycle",
  request: { body: jsonContentRequired(LeaderRunInputSchema, "Leader run options") },
  responses: { [OK]: jsonContent(AgentRunResultSchema, "Leader cycle result"), ...upstreamError }
});

// ─── Scheduler ───────────────────────────────────────────────────────────────

const schedulerStatus = createRoute({
  method: "get",
  path: "/agents/scheduler/status",
  tags,
  security: protectedSecurity,
  summary: "Get the scheduler status",
  responses: { [OK]: jsonContent(SchedulerStatusSchema, "Scheduler state and jobs"), ...upstreamError }
});

const schedulerControl = createRoute({
  method: "post",
  path: "/agents/scheduler/{action}",
  tags,
  security: protectedSecurity,
  summary: "Control the scheduler (start/pause/resume/stop)",
  request: { params: SchedulerActionParamsSchema },
  responses: { [OK]: jsonContent(SchedulerStatusSchema, "Scheduler state after the action"), ...upstreamError }
});

// ─── Data reads ──────────────────────────────────────────────────────────────

const listCommunities = createRoute({
  method: "get",
  path: "/agents/communities",
  tags,
  security: protectedSecurity,
  summary: "List discovered communities (agent store)",
  responses: { [OK]: jsonContent(RecordListSchema, "Communities"), ...upstreamError }
});

const listLeads = createRoute({
  method: "get",
  path: "/agents/leads",
  tags,
  security: protectedSecurity,
  summary: "List flagged leads (agent store)",
  responses: { [OK]: jsonContent(RecordListSchema, "Leads"), ...upstreamError }
});

// ─── Gateway decision hooks ──────────────────────────────────────────────────

const talkDecide = createRoute({
  method: "post",
  path: "/agents/talk/decide",
  tags,
  security: protectedSecurity,
  summary: "Judge one inbound group message (Talk)",
  request: {
    query: DecideQuerySchema,
    body: jsonContentRequired(DecideContextSchema, "TalkContext")
  },
  responses: { [OK]: jsonContent(AgentRunResultSchema, "Talk decision"), ...upstreamError }
});

const salesDecide = createRoute({
  method: "post",
  path: "/agents/sales/decide",
  tags,
  security: protectedSecurity,
  summary: "Respond to one inbound DM (Sales)",
  request: {
    query: DecideQuerySchema,
    body: jsonContentRequired(DecideContextSchema, "SalesContext")
  },
  responses: { [OK]: jsonContent(AgentRunResultSchema, "Sales reply"), ...upstreamError }
});

// ─── Account login flow ──────────────────────────────────────────────────────

const sendCode = createRoute({
  method: "post",
  path: "/agents/accounts/send-code",
  tags,
  security: protectedSecurity,
  summary: "Telegram login step 1 — request an OTP",
  request: { body: jsonContentRequired(SendCodeInputSchema, "Phone number") },
  responses: { [OK]: jsonContent(LoginStepResultSchema, "Login step result"), ...upstreamError }
});

const verifyCode = createRoute({
  method: "post",
  path: "/agents/accounts/verify-code",
  tags,
  security: protectedSecurity,
  summary: "Telegram login step 2 — submit the OTP",
  request: { body: jsonContentRequired(VerifyCodeInputSchema, "Phone + code") },
  responses: { [OK]: jsonContent(LoginStepResultSchema, "Login step result"), ...upstreamError }
});

const verifyPassword = createRoute({
  method: "post",
  path: "/agents/accounts/verify-password",
  tags,
  security: protectedSecurity,
  summary: "Telegram login step 3 — submit the 2FA password",
  request: { body: jsonContentRequired(VerifyPasswordInputSchema, "Phone + password") },
  responses: { [OK]: jsonContent(LoginStepResultSchema, "Login step result"), ...upstreamError }
});

const connectDiscord = createRoute({
  method: "post",
  path: "/agents/accounts/discord/connect",
  tags,
  security: protectedSecurity,
  summary: "Connect a Discord account from its user token (single step)",
  request: { body: jsonContentRequired(ConnectDiscordInputSchema, "Discord user token") },
  responses: { [OK]: jsonContent(LoginStepResultSchema, "Login step result"), ...upstreamError }
});

// ─── Account management ──────────────────────────────────────────────────────

const listAccounts = createRoute({
  method: "get",
  path: "/agents/accounts",
  tags,
  security: protectedSecurity,
  summary: "List the brand's agent accounts",
  responses: { [OK]: jsonContent(AgentAccountListSchema, "Accounts"), ...upstreamError }
});

const setAccountStatus = createRoute({
  method: "post",
  path: "/agents/accounts/{id}/status",
  tags,
  security: protectedSecurity,
  summary: "Activate / pause / restrict an account",
  request: {
    params: AccountIdParamsSchema,
    body: jsonContentRequired(SetAccountStatusInputSchema, "New status")
  },
  responses: { [OK]: jsonContent(AgentAccountViewSchema, "Updated account"), ...upstreamError }
});

const deleteAccount = createRoute({
  method: "delete",
  path: "/agents/accounts/{id}",
  tags,
  security: protectedSecurity,
  summary: "Delete an agent account",
  request: { params: AccountIdParamsSchema },
  responses: { [NO_CONTENT]: { description: "Account deleted" }, ...upstreamError }
});

// ─── Router ──────────────────────────────────────────────────────────────────

const router = createRouter();
router.use("*", requireAuth, requireBrand);

export const agentsRouter = router
  .openapi(runSearch, async (c) => c.json(await agentsService.runSearch(ctxOf(c), c.req.valid("json")), OK))
  .openapi(runResearch, async (c) => c.json(await agentsService.runResearch(ctxOf(c), c.req.valid("json")), OK))
  .openapi(runLeader, async (c) => c.json(await agentsService.runLeader(ctxOf(c), c.req.valid("json")), OK))
  .openapi(schedulerStatus, async (c) => c.json(await agentsService.schedulerStatus(ctxOf(c)), OK))
  .openapi(schedulerControl, async (c) =>
    c.json(await agentsService.schedulerAction(ctxOf(c), c.req.valid("param").action), OK)
  )
  .openapi(listCommunities, async (c) => c.json(await agentsService.listAgentCommunities(ctxOf(c)), OK))
  .openapi(listLeads, async (c) => c.json(await agentsService.listAgentLeads(ctxOf(c)), OK))
  .openapi(talkDecide, async (c) =>
    c.json(await agentsService.talkDecide(ctxOf(c), c.req.valid("json"), c.req.valid("query").account_active), OK)
  )
  .openapi(salesDecide, async (c) =>
    c.json(await agentsService.salesDecide(ctxOf(c), c.req.valid("json"), c.req.valid("query").account_active), OK)
  )
  .openapi(sendCode, async (c) => c.json(await agentsService.sendCode(ctxOf(c), c.req.valid("json")), OK))
  .openapi(verifyCode, async (c) => c.json(await agentsService.verifyCode(ctxOf(c), c.req.valid("json")), OK))
  .openapi(verifyPassword, async (c) =>
    c.json(await agentsService.verifyPassword(ctxOf(c), c.req.valid("json")), OK)
  )
  .openapi(connectDiscord, async (c) =>
    c.json(await agentsService.connectDiscord(ctxOf(c), c.req.valid("json")), OK)
  )
  .openapi(listAccounts, async (c) => c.json(await agentsService.listAgentAccounts(ctxOf(c)), OK))
  .openapi(setAccountStatus, async (c) =>
    c.json(
      await agentsService.setAgentAccountStatus(ctxOf(c), c.req.valid("param").id, c.req.valid("json").status),
      OK
    )
  )
  .openapi(deleteAccount, async (c) => {
    await agentsService.deleteAgentAccount(ctxOf(c), c.req.valid("param").id);
    return c.body(null, NO_CONTENT);
  });
