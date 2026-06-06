import { createRoute, z } from "@hono/zod-openapi";
import { NO_CONTENT, NOT_FOUND, OK } from "stoker/http-status-codes";
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers";
import { createErrorSchema, IdUUIDParamsSchema } from "stoker/openapi/schemas";
import { createRouter } from "../../lib/create-app.js";
import { requireAuth, requireBrand } from "../../middlewares/index.js";
import { ErrorSchema, protectedSecurity } from "../../schemas/common.schema.js";
import { AccountSchema, UpdateAccountSchema } from "../../schemas/accounts.schema.js";
import * as accountsService from "../../services/accounts.service.js";

const tags = ["Accounts"];

const listAccounts = createRoute({
  method: "get",
  path: "/accounts",
  tags,
  security: protectedSecurity,
  summary: "List the brand's sending accounts (Telegram/Discord)",
  responses: {
    [OK]: jsonContent(z.array(AccountSchema), "The brand's accounts with community counts")
  }
});

const updateAccount = createRoute({
  method: "put",
  path: "/accounts/{id}",
  tags,
  security: protectedSecurity,
  summary: "Update an account's display name or status",
  request: {
    params: IdUUIDParamsSchema,
    body: jsonContentRequired(UpdateAccountSchema, "Fields to update")
  },
  responses: {
    [OK]: jsonContent(AccountSchema, "The updated account"),
    [NOT_FOUND]: jsonContent(ErrorSchema, "Account not found"),
    [422]: jsonContent(createErrorSchema(UpdateAccountSchema), "Validation error")
  }
});

const deleteAccount = createRoute({
  method: "delete",
  path: "/accounts/{id}",
  tags,
  security: protectedSecurity,
  summary: "Delete an account",
  request: { params: IdUUIDParamsSchema },
  responses: {
    [NO_CONTENT]: { description: "Account deleted" },
    [NOT_FOUND]: jsonContent(ErrorSchema, "Account not found")
  }
});

const router = createRouter();
router.use("*", requireAuth, requireBrand);

export const accountsRouter = router
  .openapi(listAccounts, async (c) => {
    const accounts = await accountsService.listAccounts(c.get("brand").id);
    return c.json(accounts, OK);
  })
  .openapi(updateAccount, async (c) => {
    const { id } = c.req.valid("param");
    const account = await accountsService.updateAccount(c.get("brand").id, id, c.req.valid("json"));
    return c.json(account, OK);
  })
  .openapi(deleteAccount, async (c) => {
    const { id } = c.req.valid("param");
    await accountsService.deleteAccount(c.get("brand").id, id);
    return c.body(null, NO_CONTENT);
  });
