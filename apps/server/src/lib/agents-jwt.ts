import { sign } from "hono/jwt";
import env from "../env.js";

/**
 * Create the service JWT Hono sends to the Python agent service.
 *
 * Simple shared-secret design: signed with HS256 using AGENTS_JWT_SECRET, which
 * the Python side holds too and uses to verify. No `exp` claim is set, so the
 * token does not expire.
 *
 * Optionally pass a payload (e.g. `{ brandId, userId }`) to carry context the
 * agent service can read after verifying.
 */
export function createServiceToken(payload: Record<string, unknown> = {}): Promise<string> {
  return sign({ ...payload, iss: "orbis-hono" }, env.AGENTS_JWT_SECRET, "HS256");
}
