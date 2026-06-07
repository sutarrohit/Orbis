import { z } from "@hono/zod-openapi";

/**
 * The error envelope produced by `onError` (src/middlewares/on-error.ts).
 * Use it to document 4xx/5xx responses so Swagger matches what clients receive.
 */
export const ErrorSchema = z
  .object({
    statusCode: z.number().openapi({ example: 404 }),
    message: z.string().openapi({ example: "Resource not found" }),
    stack: z.string().optional(),
  })
  .openapi("Error");

/**
 * A `DateTime` column. Prisma hands back a `Date` (so `z.infer` is `Date`, which
 * matches what handlers return), but it serializes to an ISO string on the wire —
 * hence the `string`/`date-time` override so the OpenAPI doc is accurate.
 */
export const dateField = () =>
  z
    .date()
    .openapi({
      type: "string",
      format: "date-time",
      example: "2025-01-01T00:00:00.000Z",
    });

export const nullableDateField = () =>
  z
    .date()
    .nullable()
    .openapi({
      type: "string",
      format: "date-time",
      example: "2025-01-01T00:00:00.000Z",
    });

/** Cookie-session security requirement applied to every authenticated route. */
export const protectedSecurity = [{ cookieAuth: [] }];
