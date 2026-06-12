import { BAD_GATEWAY, GATEWAY_TIMEOUT, NO_CONTENT } from "stoker/http-status-codes";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import env from "../env.js";
import { ApiError } from "../lib/api-error.js";
import { createServiceToken } from "../lib/agents-jwt.js";
import type {
  AgentAccountList,
  AgentRunResult,
  ConnectBotInput,
  DecideContext,
  LeaderRunInput,
  LoginStepResult,
  RecordList,
  ResearchRunInput,
  SchedulerStatus,
  SearchRunInput,
  SearchRunResult,
  SendCodeInput,
  VerifyCodeInput,
  VerifyPasswordInput
} from "../schemas/agents.schema.js";

const REQUEST_TIMEOUT_MS = 60_000;

export interface AgentCallOptions {
  /** Authenticated user — carried in the service token payload. */
  userId: string;
  /** Resolved brand — carried in the token and forwarded to the agent service. */
  brandId: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** JSON body (POST/PUT). */
  body?: unknown;
  /** Query params; undefined values are skipped. */
  query?: Record<string, string | number | boolean | undefined>;
}

/**
 * Call the Python agent service on behalf of an authenticated user. Signs a
 * shared-secret service JWT, forwards the request, and maps failures cleanly:
 *   - unreachable / timeout → 502 / 504
 *   - upstream 5xx          → 502 (don't leak internal errors)
 *   - upstream 4xx          → passed through with its detail
 */
export async function callAgents<T = unknown>(path: string, opts: AgentCallOptions): Promise<T> {
  const token = await createServiceToken({ brandId: opts.brandId, userId: opts.userId });

  const url = new URL(path.replace(/^\//, ""), ensureTrailingSlash(env.AGENTS_SERVICE_URL));
  for (const [key, value] of Object.entries(opts.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const method = opts.method ?? "GET";
  const hasBody = opts.body !== undefined && method !== "GET";

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json",
        ...(hasBody ? { "content-type": "application/json" } : {})
      },
      body: hasBody ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new ApiError(
      timedOut ? GATEWAY_TIMEOUT : BAD_GATEWAY,
      timedOut ? "AGENTS_TIMEOUT" : "AGENTS_UNREACHABLE",
      timedOut ? "The agent service timed out" : "The agent service is unreachable"
    );
  }

  if (!res.ok) {
    const detail = await readError(res);
    if (res.status >= 500) {
      throw new ApiError(BAD_GATEWAY, "AGENTS_UPSTREAM_ERROR", "The agent service failed");
    }
    throw new ApiError(res.status as ContentfulStatusCode, "AGENTS_REQUEST_REJECTED", detail);
  }

  if (res.status === NO_CONTENT) return null as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

// ─── Brand-aware proxy wrappers ──────────────────────────────────────────────
// The browser sends only the knobs; Hono supplies niche + brand_id (the agent
// service reads brand_id from the request and resolves it to the real brand row).

interface AgentContext {
  brandId: string;
  userId: string;
  niche: string;
}

export function runSearch(ctx: AgentContext, input: SearchRunInput): Promise<SearchRunResult> {
  return callAgents<SearchRunResult>("/api/agents/search/run", {
    method: "POST",
    brandId: ctx.brandId,
    userId: ctx.userId,
    body: {
      niche: ctx.niche,
      brand_id: ctx.brandId,
      queries: input.queries,
      limit: input.limit,
      use_llm: input.useLlm,
      firecrawl_mode: input.firecrawlMode
    }
  });
}

export function runResearch(ctx: AgentContext, input: ResearchRunInput): Promise<AgentRunResult> {
  return callAgents<AgentRunResult>("/api/agents/research/run", {
    method: "POST",
    brandId: ctx.brandId,
    userId: ctx.userId,
    body: { brand_id: ctx.brandId, niche: ctx.niche, use_llm: input.useLlm }
  });
}

export function runLeader(ctx: AgentContext, input: LeaderRunInput): Promise<AgentRunResult> {
  return callAgents<AgentRunResult>("/api/agents/leader/run", {
    method: "POST",
    brandId: ctx.brandId,
    userId: ctx.userId,
    query: { brand_id: ctx.brandId, use_checkpointer: input.useCheckpointer }
  });
}

export function schedulerStatus(ctx: Omit<AgentContext, "niche">): Promise<SchedulerStatus> {
  return callAgents<SchedulerStatus>("/api/agents/scheduler/status", {
    method: "GET",
    brandId: ctx.brandId,
    userId: ctx.userId
  });
}

export function schedulerAction(
  ctx: Omit<AgentContext, "niche">,
  action: "start" | "pause" | "resume" | "stop"
): Promise<SchedulerStatus> {
  return callAgents<SchedulerStatus>(`/api/agents/scheduler/${action}`, {
    method: "POST",
    brandId: ctx.brandId,
    userId: ctx.userId
  });
}

type BrandCtx = Omit<AgentContext, "niche">;

// ── Data reads (relayed from the agent store) ────────────────────────────────

export function listAgentCommunities(ctx: BrandCtx): Promise<RecordList> {
  return callAgents<RecordList>("/api/agents/communities", {
    method: "GET",
    brandId: ctx.brandId,
    userId: ctx.userId,
    query: { brand_id: ctx.brandId }
  });
}

export function listAgentLeads(ctx: BrandCtx): Promise<RecordList> {
  return callAgents<RecordList>("/api/agents/leads", {
    method: "GET",
    brandId: ctx.brandId,
    userId: ctx.userId,
    query: { brand_id: ctx.brandId }
  });
}

// ── Gateway decision hooks (brand_id injected into the context body) ──────────

export function talkDecide(
  ctx: BrandCtx,
  context: DecideContext,
  accountActive?: "true" | "false"
): Promise<AgentRunResult> {
  return callAgents<AgentRunResult>("/api/agents/talk/decide", {
    method: "POST",
    brandId: ctx.brandId,
    userId: ctx.userId,
    body: { ...context, brand_id: ctx.brandId },
    query: { account_active: accountActive }
  });
}

export function salesDecide(
  ctx: BrandCtx,
  context: DecideContext,
  accountActive?: "true" | "false"
): Promise<AgentRunResult> {
  return callAgents<AgentRunResult>("/api/agents/sales/decide", {
    method: "POST",
    brandId: ctx.brandId,
    userId: ctx.userId,
    body: { ...context, brand_id: ctx.brandId },
    query: { account_active: accountActive }
  });
}

// ── Account login flow (Telegram MTProto via Python) ─────────────────────────

export function sendCode(ctx: BrandCtx, input: SendCodeInput): Promise<LoginStepResult> {
  return callAgents<LoginStepResult>("/api/accounts/send-code", {
    method: "POST",
    brandId: ctx.brandId,
    userId: ctx.userId,
    body: { brand_id: ctx.brandId, phone: input.phone }
  });
}

export function verifyCode(ctx: BrandCtx, input: VerifyCodeInput): Promise<LoginStepResult> {
  return callAgents<LoginStepResult>("/api/accounts/verify-code", {
    method: "POST",
    brandId: ctx.brandId,
    userId: ctx.userId,
    body: { brand_id: ctx.brandId, phone: input.phone, code: input.code }
  });
}

export function verifyPassword(ctx: BrandCtx, input: VerifyPasswordInput): Promise<LoginStepResult> {
  return callAgents<LoginStepResult>("/api/accounts/verify-password", {
    method: "POST",
    brandId: ctx.brandId,
    userId: ctx.userId,
    body: { brand_id: ctx.brandId, phone: input.phone, password: input.password }
  });
}

// ── Account connect (Discord bot — single step) ──────────────────────────────

export function connectBot(ctx: BrandCtx, input: ConnectBotInput): Promise<LoginStepResult> {
  return callAgents<LoginStepResult>("/api/accounts/connect-bot", {
    method: "POST",
    brandId: ctx.brandId,
    userId: ctx.userId,
    body: { brand_id: ctx.brandId, token: input.token }
  });
}

// ── Account management (relayed from the agent account store) ─────────────────

export function listAgentAccounts(ctx: BrandCtx): Promise<AgentAccountList> {
  return callAgents<AgentAccountList>("/api/accounts", {
    method: "GET",
    brandId: ctx.brandId,
    userId: ctx.userId,
    query: { brand_id: ctx.brandId }
  });
}

export function setAgentAccountStatus(
  ctx: BrandCtx,
  accountId: string,
  status: "active" | "paused" | "restricted"
): Promise<AgentAccountList[number]> {
  return callAgents<AgentAccountList[number]>(`/api/accounts/${accountId}/status`, {
    method: "POST",
    brandId: ctx.brandId,
    userId: ctx.userId,
    query: { brand_id: ctx.brandId, status }
  });
}

export function deleteAgentAccount(ctx: BrandCtx, accountId: string): Promise<null> {
  return callAgents<null>(`/api/accounts/${accountId}`, {
    method: "DELETE",
    brandId: ctx.brandId,
    userId: ctx.userId,
    query: { brand_id: ctx.brandId }
  });
}

function ensureTrailingSlash(base: string): string {
  return base.endsWith("/") ? base : `${base}/`;
}

/** Best-effort extraction of an upstream error message (FastAPI uses `detail`). */
async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body === "object") {
      const record = body as Record<string, unknown>;
      const detail = record.detail ?? record.error;
      if (typeof detail === "string") return detail;
      if (detail) return JSON.stringify(detail);
    }
  } catch {
    // not JSON — fall through
  }
  return `Agent service responded ${res.status}`;
}
