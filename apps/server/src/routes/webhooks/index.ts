import { timingSafeEqual } from "node:crypto";
import { OK, UNAUTHORIZED } from "stoker/http-status-codes";
import { createRouter } from "../../lib/create-app.js";
import env from "../../env.js";
import { handleTelegramUpdate, type TelegramUpdate } from "../../services/telegram.service.js";

/** Constant-time string compare (avoids leaking the secret via timing). */
function secretMatches(provided: string | undefined): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(env.TELEGRAM_WEBHOOK_SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

// External, unauthenticated webhook endpoints (no session, no OpenAPI) — mounted
// at the root like /health. Telegram is the only caller; it proves itself with
// the secret token we registered via `pnpm webhook:telegram`.
const router = createRouter();

router.post("/telegram", async (c) => {
  // Telegram echoes the secret we set on setWebhook in this header.
  if (!secretMatches(c.req.header("x-telegram-bot-api-secret-token"))) {
    return c.json({ error: "invalid secret token" }, UNAUTHORIZED);
  }

  let update: TelegramUpdate;
  try {
    update = await c.req.json();
  } catch {
    // Not JSON — ack so Telegram doesn't retry, but there's nothing to do.
    return c.json({ ok: true }, OK);
  }

  try {
    await handleTelegramUpdate(update, c.get("logger"));
  } catch (err) {
    // Always ack 2xx: a non-2xx makes Telegram redeliver in a tight loop. Log
    // the failure for follow-up instead.
    c.get("logger").error({ err }, "telegram webhook processing failed");
  }

  return c.json({ ok: true }, OK);
});

export const webhooksRouter = router;
