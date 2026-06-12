import { request } from "@/utils/request";

/**
 * Telegram account login flow (proxied to the Python agent service).
 * Note: these `/agents/*` routes return snake_case fields.
 */
export type LoginStatus = "code_sent" | "password_needed" | "connected";

export interface AgentAccount {
  id: string;
  external_id: string;
  handle: string;
  phone: string | null;
  display_name: string | null;
  platform: string;
  status: string;
  last_health_check_at: string;
  created_at: string;
}

export interface LoginStepResult {
  status: LoginStatus;
  account: AgentAccount | null;
}

export function sendCode(input: { phone: string }): Promise<LoginStepResult> {
  return request("/agents/accounts/send-code", { method: "POST", body: JSON.stringify(input) });
}

export function verifyCode(input: { phone: string; code: string }): Promise<LoginStepResult> {
  return request("/agents/accounts/verify-code", { method: "POST", body: JSON.stringify(input) });
}

export function verifyPassword(input: { phone: string; password: string }): Promise<LoginStepResult> {
  return request("/agents/accounts/verify-password", { method: "POST", body: JSON.stringify(input) });
}

/** Discord bot connect — single step (the token is the credential). */
export function connectBot(input: { token: string }): Promise<LoginStepResult> {
  return request("/agents/accounts/connect-bot", { method: "POST", body: JSON.stringify(input) });
}

/* ── Scheduler ─────────────────────────────────────────────────────────── */

export type SchedulerAction = "start" | "pause" | "resume" | "stop";

export interface SchedulerJob {
  id: string;
  next_run_time: string | null;
}

export interface SchedulerStatus {
  state: string;
  jobs: SchedulerJob[];
}

export function getSchedulerStatus(): Promise<SchedulerStatus> {
  return request("/agents/scheduler/status");
}

export function schedulerAction(action: SchedulerAction): Promise<SchedulerStatus> {
  return request(`/agents/scheduler/${action}`, { method: "POST" });
}

/* ── Manual agent runs ─────────────────────────────────────────────────── */

/** Run results are loose objects shaped by the Python agent service. */
export type AgentRunResult = Record<string, unknown>;

export interface RunSearchInput {
  queries?: string[];
  limit?: number;
  useLlm?: boolean;
  firecrawlMode?: "live" | "fixture";
}

export function runSearch(input: RunSearchInput = {}): Promise<AgentRunResult> {
  return request("/agents/search/run", { method: "POST", body: JSON.stringify(input) });
}

export function runResearch(input: { useLlm?: boolean } = {}): Promise<AgentRunResult> {
  return request("/agents/research/run", { method: "POST", body: JSON.stringify(input) });
}

export function runLeader(input: { useCheckpointer?: boolean } = {}): Promise<AgentRunResult> {
  return request("/agents/leader/run", { method: "POST", body: JSON.stringify(input) });
}
