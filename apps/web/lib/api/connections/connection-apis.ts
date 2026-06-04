import { request } from "@/utils/request";

/** A connected bot as returned by `GET /connections` (safe fields). */
export interface Connection {
  id: string;
  platform: string;
  externalId: string;
  displayName: string | null;
  status: string;
  createdAt: string;
}

export interface CreateConnectionInput {
  platform: string;
  token: string;
}

export interface CreatedConnection {
  id: string;
  platform: string;
  displayName: string | null;
  status: string;
}

export function listConnections(): Promise<Connection[]> {
  return request("/connections");
}

export function createConnection(input: CreateConnectionInput): Promise<CreatedConnection> {
  return request("/connections", { method: "POST", body: JSON.stringify(input) });
}

export function deleteConnection(id: string): Promise<{ success: boolean }> {
  return request(`/connections/${id}`, { method: "DELETE" });
}
