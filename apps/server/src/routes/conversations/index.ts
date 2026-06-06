import { createRoute, z } from "@hono/zod-openapi";
import { CREATED, NOT_FOUND, OK } from "stoker/http-status-codes";
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers";
import { createErrorSchema } from "stoker/openapi/schemas";
import { createRouter } from "../../lib/create-app.js";
import { requireAuth, requireBrand } from "../../middlewares/index.js";
import { ErrorSchema, protectedSecurity } from "../../schemas/common.schema.js";
import {
  ConversationSchema,
  ListConversationsQuery,
  PendingSendSchema,
  SendMessageSchema
} from "../../schemas/conversations.schema.js";
import * as conversationsService from "../../services/conversations.service.js";

const tags = ["Conversations"];

const listConversations = createRoute({
  method: "get",
  path: "/conversations",
  tags,
  security: protectedSecurity,
  summary: "List recent conversations",
  request: { query: ListConversationsQuery },
  responses: {
    [OK]: jsonContent(z.array(ConversationSchema), "The latest 100 conversations")
  }
});

const sendMessage = createRoute({
  method: "post",
  path: "/conversations/send",
  tags,
  security: protectedSecurity,
  summary: "Queue a DM for the gateway to deliver",
  request: {
    body: jsonContentRequired(SendMessageSchema, "DM to enqueue")
  },
  responses: {
    [CREATED]: jsonContent(PendingSendSchema, "The queued send"),
    [NOT_FOUND]: jsonContent(ErrorSchema, "Lead or account not found"),
    [422]: jsonContent(createErrorSchema(SendMessageSchema), "Validation error")
  }
});

const router = createRouter();
router.use("*", requireAuth, requireBrand);

export const conversationsRouter = router
  .openapi(listConversations, async (c) => {
    const conversations = await conversationsService.listConversations(
      c.get("brand").id,
      c.req.valid("query")
    );
    return c.json(conversations, OK);
  })
  .openapi(sendMessage, async (c) => {
    const send = await conversationsService.queueSend(c.get("brand").id, c.req.valid("json"));
    return c.json(send, CREATED);
  });
