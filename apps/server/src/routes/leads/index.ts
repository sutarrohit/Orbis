import { createRoute } from "@hono/zod-openapi";
import { NOT_FOUND, OK } from "stoker/http-status-codes";
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers";
import { createErrorSchema, IdUUIDParamsSchema } from "stoker/openapi/schemas";
import { createRouter } from "../../lib/create-app.js";
import { requireAuth, requireBrand } from "../../middlewares/index.js";
import { ErrorSchema, protectedSecurity } from "../../schemas/common.schema.js";
import {
  LeadSchema,
  LeadWithConversationsSchema,
  ListLeadsQuery,
  ListLeadsResponseSchema,
  UpdateLeadSchema
} from "../../schemas/leads.schema.js";
import * as leadsService from "../../services/leads.service.js";

const tags = ["Leads"];

const listLeads = createRoute({
  method: "get",
  path: "/leads",
  tags,
  security: protectedSecurity,
  summary: "List leads with status counts",
  request: { query: ListLeadsQuery },
  responses: {
    [OK]: jsonContent(ListLeadsResponseSchema, "Leads and aggregate counts by status")
  }
});

const getLead = createRoute({
  method: "get",
  path: "/leads/{id}",
  tags,
  security: protectedSecurity,
  summary: "Get one lead with its recent conversations",
  request: { params: IdUUIDParamsSchema },
  responses: {
    [OK]: jsonContent(LeadWithConversationsSchema, "The lead"),
    [NOT_FOUND]: jsonContent(ErrorSchema, "Lead not found")
  }
});

const updateLead = createRoute({
  method: "put",
  path: "/leads/{id}",
  tags,
  security: protectedSecurity,
  summary: "Update a lead",
  request: {
    params: IdUUIDParamsSchema,
    body: jsonContentRequired(UpdateLeadSchema, "Fields to update")
  },
  responses: {
    [OK]: jsonContent(LeadSchema, "The updated lead"),
    [NOT_FOUND]: jsonContent(ErrorSchema, "Lead not found"),
    [422]: jsonContent(createErrorSchema(UpdateLeadSchema), "Validation error")
  }
});

const router = createRouter();
router.use("*", requireAuth, requireBrand);

export const leadsRouter = router
  .openapi(listLeads, async (c) => {
    const { status } = c.req.valid("query");
    const result = await leadsService.listLeads(c.get("brand").id, status);
    return c.json(result, OK);
  })
  .openapi(getLead, async (c) => {
    const { id } = c.req.valid("param");
    const lead = await leadsService.getLead(c.get("brand").id, id);
    return c.json(lead, OK);
  })
  .openapi(updateLead, async (c) => {
    const { id } = c.req.valid("param");
    const lead = await leadsService.updateLead(c.get("brand").id, id, c.req.valid("json"));
    return c.json(lead, OK);
  });
