import type { PinoLogger } from "hono-pino";

// Minimal shape of the Telegram Update payload — only the bits we read. Telegram
// sends far more; the rest is ignored.
export interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
  [key: string]: unknown;
}

/** The message-bearing part of an update, whichever field carried it. */
function extractMessage(update: TelegramUpdate): TelegramMessage | undefined {
  return update.message ?? update.edited_message ?? update.channel_post ?? update.edited_channel_post;
}

/**
 * Process one inbound Telegram update. Kept side-effect-light for now: it logs a
 * structured summary. This is the extension point for persisting inbound
 * messages (→ `conversation`) or routing them to the agents once the
 * bot→brand mapping is decided.
 */
export async function handleTelegramUpdate(update: TelegramUpdate, logger: PinoLogger): Promise<void> {
  const message = extractMessage(update);
  if (!message) {
    logger.debug({ updateId: update.update_id }, "telegram: non-message update ignored");
    return;
  }

  logger.info(
    {
      updateId: update.update_id,
      chatId: message.chat.id,
      chatType: message.chat.type,
      fromId: message.from?.id,
      username: message.from?.username,
      hasText: typeof message.text === "string"
    },
    "telegram: inbound message"
  );

  // TODO: persist to `conversation` / route to agents once bot→brand resolution
  // is defined (the bot token is server-wide; a SocialAccount lookup would map
  // the update to a brand).
}
