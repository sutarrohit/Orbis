import { createRoute } from "@hono/zod-openapi";
import { OK } from "stoker/http-status-codes";
import { jsonContent } from "stoker/openapi/helpers";
import { createRouter } from "../../lib/create-app.js";
import { requireAuth, requireBrand } from "../../middlewares/index.js";
import { protectedSecurity } from "../../schemas/common.schema.js";
import {
  ListGroupMembersQuery,
  ListGroupMembersResponseSchema
} from "../../schemas/group-members.schema.js";
import * as groupMembersService from "../../services/group-members.service.js";

const listGroupMembers = createRoute({
  method: "get",
  path: "/group-members",
  tags: ["Group Members"],
  security: protectedSecurity,
  summary: "List scraped group members",
  request: { query: ListGroupMembersQuery },
  responses: {
    [OK]: jsonContent(ListGroupMembersResponseSchema, "Group members and total count")
  }
});

const router = createRouter();
router.use("*", requireAuth, requireBrand);

export const groupMembersRouter = router.openapi(listGroupMembers, async (c) => {
  const { chatId } = c.req.valid("query");
  const result = await groupMembersService.listGroupMembers(c.get("brand").id, chatId);
  return c.json(result, OK);
});
