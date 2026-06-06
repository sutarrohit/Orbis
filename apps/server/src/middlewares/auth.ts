import { createMiddleware } from "hono/factory";
import { NOT_FOUND, UNAUTHORIZED } from "stoker/http-status-codes";
import { auth } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/api-error.js";
import type { AppBinding } from "../lib/types.js";

/**
 * Validates the better-auth cookie session and puts the user on the context.
 * Rejects unauthenticated requests with 401. Apply to every feature router.
 */
export const requireAuth = createMiddleware<AppBinding>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    throw new ApiError(UNAUTHORIZED, "UNAUTHORIZED", "Authentication required");
  }
  c.set("user", session.user);
  await next();
});

/**
 * Resolves the session user's brand (the tenant root every data route scopes by)
 * and puts it on the context. 404s if the user has no brand yet. Must run after
 * {@link requireAuth}.
 *
 * Note: the schema allows a user to own multiple brands, but the product is
 * single-brand-per-user today, so we resolve the user's (only) brand. Brand
 * switching can layer a `?brandId=`/header selector on top later.
 */
export const requireBrand = createMiddleware<AppBinding>(async (c, next) => {
  const user = c.get("user");
  const brand = await prisma.brand.findFirst({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" }
  });
  if (!brand) {
    throw new ApiError(NOT_FOUND, "BRAND_NOT_FOUND", "No brand found for this user");
  }
  c.set("brand", brand);
  await next();
});
