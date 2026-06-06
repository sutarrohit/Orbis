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
