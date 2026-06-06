import { createRoute } from "@hono/zod-openapi";
import { CONFLICT, CREATED, NOT_FOUND, OK } from "stoker/http-status-codes";
import { jsonContent, jsonContentRequired } from "stoker/openapi/helpers";
import { createErrorSchema } from "stoker/openapi/schemas";
import { createRouter } from "../../lib/create-app.js";
import { requireAuth } from "../../middlewares/index.js";
import { ErrorSchema, protectedSecurity } from "../../schemas/common.schema.js";
import {
  BrandSchema,
  CreateBrandSchema,
  GetBrandResponseSchema,
  UpdateBrandSchema
} from "../../schemas/brand.schema.js";
import * as brandService from "../../services/brand.service.js";

const tags = ["Brand"];

const getBrand = createRoute({
  method: "get",
  path: "/brand",
  tags,
  security: protectedSecurity,
  summary: "Get the current user's brand",
  responses: {
    [OK]: jsonContent(GetBrandResponseSchema, "The user's brand, or null if none")
  }
});

const createBrand = createRoute({
  method: "post",
  path: "/brand",
  tags,
  security: protectedSecurity,
  summary: "Create the user's brand (onboarding)",
  request: {
    body: jsonContentRequired(CreateBrandSchema, "Brand to create")
  },
  responses: {
    [CREATED]: jsonContent(BrandSchema, "The created brand"),
    [CONFLICT]: jsonContent(ErrorSchema, "A brand already exists for this user"),
    [422]: jsonContent(createErrorSchema(CreateBrandSchema), "Validation error")
  }
});

const updateBrand = createRoute({
  method: "put",
  path: "/brand",
  tags,
  security: protectedSecurity,
  summary: "Update the brand and its sales profile",
  request: {
    body: jsonContentRequired(UpdateBrandSchema, "Fields to update")
  },
  responses: {
    [OK]: jsonContent(BrandSchema, "The updated brand"),
    [NOT_FOUND]: jsonContent(ErrorSchema, "No brand found for this user"),
    [422]: jsonContent(createErrorSchema(UpdateBrandSchema), "Validation error")
  }
});

const router = createRouter();
router.use("*", requireAuth);

export const brandRouter = router
  .openapi(getBrand, async (c) => {
    const brand = await brandService.getBrandForUser(c.get("user").id);
    return c.json({ brand }, OK);
  })
  .openapi(createBrand, async (c) => {
    const brand = await brandService.createBrandForUser(c.get("user").id, c.req.valid("json"));
    return c.json(brand, CREATED);
  })
  .openapi(updateBrand, async (c) => {
    const brand = await brandService.updateBrandForUser(c.get("user").id, c.req.valid("json"));
    return c.json(brand, OK);
  });
