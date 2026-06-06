import { createRoute, z } from "@hono/zod-openapi";
import { CONFLICT, CREATED, NOT_FOUND, OK } from "stoker/http-status-codes";
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers";
import { createErrorSchema, IdUUIDParamsSchema } from "stoker/openapi/schemas";
import { createRouter } from "../../lib/create-app.js";
import { requireAuth, requireBrand } from "../../middlewares/index.js";
import { ErrorSchema, protectedSecurity } from "../../schemas/common.schema.js";
import {
  CommunitySchema,
  CreateCommunitySchema,
  ListCommunitiesQuery,
  UpdateCommunitySchema
} from "../../schemas/communities.schema.js";
import * as communitiesService from "../../services/communities.service.js";

const tags = ["Communities"];

const listCommunities = createRoute({
  method: "get",
  path: "/communities",
  tags,
  security: protectedSecurity,
  summary: "List discovered communities",
  request: { query: ListCommunitiesQuery },
  responses: {
    [OK]: jsonContent(z.array(CommunitySchema), "The brand's communities")
  }
});

const createCommunity = createRoute({
  method: "post",
  path: "/communities",
  tags,
  security: protectedSecurity,
  summary: "Add a community",
  request: {
    body: jsonContentRequired(CreateCommunitySchema, "Community to add")
  },
  responses: {
    [CREATED]: jsonContent(CommunitySchema, "The created community"),
    [CONFLICT]: jsonContent(ErrorSchema, "A community with this handle already exists"),
    [422]: jsonContent(createErrorSchema(CreateCommunitySchema), "Validation error")
  }
});

const updateCommunity = createRoute({
  method: "put",
  path: "/communities/{id}",
  tags,
  security: protectedSecurity,
  summary: "Update a community (status, assignment, etc.)",
  request: {
    params: IdUUIDParamsSchema,
    body: jsonContentRequired(UpdateCommunitySchema, "Fields to update")
  },
  responses: {
    [OK]: jsonContent(CommunitySchema, "The updated community"),
    [NOT_FOUND]: jsonContent(ErrorSchema, "Community not found"),
    [422]: jsonContent(createErrorSchema(UpdateCommunitySchema), "Validation error")
  }
});

const router = createRouter();
router.use("*", requireAuth, requireBrand);

export const communitiesRouter = router
  .openapi(listCommunities, async (c) => {
    const { status } = c.req.valid("query");
    const communities = await communitiesService.listCommunities(c.get("brand").id, status);
    return c.json(communities, OK);
  })
  .openapi(createCommunity, async (c) => {
    const community = await communitiesService.createCommunity(c.get("brand").id, c.req.valid("json"));
    return c.json(community, CREATED);
  })
  .openapi(updateCommunity, async (c) => {
    const { id } = c.req.valid("param");
    const community = await communitiesService.updateCommunity(
      c.get("brand").id,
      id,
      c.req.valid("json")
    );
    return c.json(community, OK);
  });
