import { request } from "@/utils/request";
import type { Platform, SocialAccountStatus } from "@/lib/api/enums";

/** A sending account as returned by `GET /accounts`. */
export interface Account {
  id: string;
  brandId: string;
  platform: Platform;
  externalId: string;
  handle: string;
  phone: string | null;
  displayName: string | null;
  status: SocialAccountStatus;
  lastHealthCheckAt: string | null;
  createdAt: string;
  updatedAt: string;
  communityCounts: { total: number; joined: number; pending: number };
}

export interface UpdateAccountInput {
  displayName?: string | null;
  status?: SocialAccountStatus;
}

export function listAccounts(): Promise<Account[]> {
  return request("/accounts");
}

export function updateAccount(id: string, input: UpdateAccountInput): Promise<Account> {
  return request(`/accounts/${id}`, { method: "PUT", body: JSON.stringify(input) });
}

export function deleteAccount(id: string): Promise<void> {
  return request(`/accounts/${id}`, { method: "DELETE" });
}
