import { z } from "@hono/zod-openapi";

// ─── Agent runs: request bodies (browser → Hono) ─────────────────────────────
// The browser sends only the knobs; Hono fills niche + brand_id from the
// authenticated brand before calling the agent service.

export const SearchRunInputSchema = z
  .object({
    queries: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(50).optional(),
    useLlm: z.boolean().optional(),
    firecrawlMode: z.enum(["live", "fixture"]).optional()
  })
  .openapi("SearchRunInput");

export const ResearchRunInputSchema = z
  .object({ useLlm: z.boolean().optional() })
  .openapi("ResearchRunInput");

export const LeaderRunInputSchema = z
  .object({ useCheckpointer: z.boolean().optional() })
  .openapi("LeaderRunInput");

export const SchedulerActionParamsSchema = z.object({
  action: z.enum(["start", "pause", "resume", "stop"])
});

// ─── Gateway decision hooks (talk/sales) ─────────────────────────────────────
// The full TalkContext / SalesContext is large and caller-supplied; relayed as
// a loose object. Hono injects brand_id. `account_active` is an optional query.
export const DecideContextSchema = z.record(z.string(), z.unknown()).openapi("DecideContext");
export const DecideQuerySchema = z.object({
  account_active: z.enum(["true", "false"]).optional()
});

// ─── Account login flow (Telegram MTProto via Python) ────────────────────────

export const SendCodeInputSchema = z
  .object({ phone: z.string().min(1) })
  .openapi("SendCodeInput");

export const VerifyCodeInputSchema = z
  .object({ phone: z.string().min(1), code: z.string().min(1) })
  .openapi("VerifyCodeInput");

export const VerifyPasswordInputSchema = z
  .object({ phone: z.string().min(1), password: z.string().min(1) })
  .openapi("VerifyPasswordInput");

export const SetAccountStatusInputSchema = z
  .object({ status: z.enum(["active", "paused", "restricted"]) })
  .openapi("SetAgentAccountStatusInput");

export const AccountIdParamsSchema = z.object({ id: z.string().min(1) });

// ─── Responses (relayed from the agent service) ──────────────────────────────
// OpenAPIHono doesn't validate responses; these document the useful shape while
// the agent service's full payload is relayed verbatim.

const LooseRecord = z.record(z.string(), z.unknown());

export const SearchRunResultSchema = z
  .object({
    brand_id: z.string(),
    niche: z.string(),
    queries: z.array(z.string()),
    firecrawl_mode: z.string(),
    used_llm: z.boolean(),
    pages_searched: z.number().int(),
    discovered: z.number().int(),
    saved_new: z.number().int(),
    duplicates: z.number().int(),
    communities: z.array(LooseRecord)
  })
  .openapi("SearchRunResult");

/** Research / Leader / talk / sales results vary; relayed as-is. */
export const AgentRunResultSchema = LooseRecord.openapi("AgentRunResult");

/** Lists of stored records (communities, leads) relayed from the store. */
export const RecordListSchema = z.array(LooseRecord).openapi("AgentRecordList");

export const SchedulerStatusSchema = z
  .object({
    state: z.string().openapi({ example: "running" }),
    jobs: z.array(z.object({ id: z.string(), next_run_time: z.string().nullable() }))
  })
  .openapi("SchedulerStatus");

export const AgentAccountViewSchema = z
  .object({
    id: z.string(),
    external_id: z.string(),
    handle: z.string(),
    phone: z.string().nullable(),
    display_name: z.string().nullable(),
    platform: z.string(),
    status: z.string(),
    last_health_check_at: z.string(),
    created_at: z.string()
  })
  .openapi("AgentAccountView");

export const AgentAccountListSchema = z.array(AgentAccountViewSchema).openapi("AgentAccountList");

export const LoginStepResultSchema = z
  .object({
    status: z.enum(["code_sent", "password_needed", "connected"]),
    account: AgentAccountViewSchema.nullable()
  })
  .openapi("LoginStepResult");

// ─── Inferred types ──────────────────────────────────────────────────────────
export type SearchRunInput = z.infer<typeof SearchRunInputSchema>;
export type ResearchRunInput = z.infer<typeof ResearchRunInputSchema>;
export type LeaderRunInput = z.infer<typeof LeaderRunInputSchema>;
export type DecideContext = z.infer<typeof DecideContextSchema>;
export type SendCodeInput = z.infer<typeof SendCodeInputSchema>;
export type VerifyCodeInput = z.infer<typeof VerifyCodeInputSchema>;
export type VerifyPasswordInput = z.infer<typeof VerifyPasswordInputSchema>;
export type SearchRunResult = z.infer<typeof SearchRunResultSchema>;
export type AgentRunResult = z.infer<typeof AgentRunResultSchema>;
export type RecordList = z.infer<typeof RecordListSchema>;
export type SchedulerStatus = z.infer<typeof SchedulerStatusSchema>;
export type AgentAccountView = z.infer<typeof AgentAccountViewSchema>;
export type AgentAccountList = z.infer<typeof AgentAccountListSchema>;
export type LoginStepResult = z.infer<typeof LoginStepResultSchema>;
