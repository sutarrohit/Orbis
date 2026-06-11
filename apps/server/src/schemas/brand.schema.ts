import { z } from "@hono/zod-openapi";
import { dateField } from "./common.schema.js";

export const BrandProfileSchema = z
  .object({
    id: z.string().uuid(),
    brandId: z.string().uuid(),
    persona: z.string(),
    productSummary: z.string(),
    pricing: z.string(),
    conversionAction: z.string(),
    objectionNotes: z.string(),
    website: z.string(),
    about: z.string(),
    createdAt: dateField(),
    updatedAt: dateField()
  })
  .openapi("BrandProfile");

export const BrandSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string(),
    name: z.string(),
    slug: z.string().nullable(),
    niche: z.string(),
    active: z.boolean(),
    createdAt: dateField(),
    updatedAt: dateField(),
    profile: BrandProfileSchema.nullable()
  })
  .openapi("Brand");

export const CreateBrandSchema = z
  .object({
    name: z.string().min(1),
    niche: z.string().default(""),
    slug: z.string().min(1).optional()
  })
  .openapi("CreateBrand");

export const UpdateBrandSchema = z
  .object({
    name: z.string().min(1).optional(),
    niche: z.string().optional(),
    slug: z.string().min(1).nullable().optional(),
    active: z.boolean().optional(),
    // Sales knowledge base (BrandProfile) — any subset.
    persona: z.string().optional(),
    productSummary: z.string().optional(),
    pricing: z.string().optional(),
    conversionAction: z.string().optional(),
    objectionNotes: z.string().optional(),
    website: z.string().optional(),
    about: z.string().optional()
  })
  .openapi("UpdateBrand");

export const GetBrandResponseSchema = z.object({ brand: BrandSchema.nullable() });

export type CreateBrandInput = z.infer<typeof CreateBrandSchema>;
export type UpdateBrandInput = z.infer<typeof UpdateBrandSchema>;
