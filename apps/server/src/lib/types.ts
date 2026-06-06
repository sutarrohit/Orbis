import { OpenAPIHono, RouteConfig, RouteHandler } from "@hono/zod-openapi";
import { PinoLogger } from "hono-pino";
import type { BrandModel } from "../../prisma/generated/models.js";
import type { Session } from "./auth.js";

export interface AppBinding {
  Variables: {
    logger: PinoLogger;
    // Set by the requireAuth middleware once a valid session is present.
    user: Session["user"];
    // Set by the requireBrand middleware; the session user's brand (tenant root).
    brand: BrandModel;
  };
}

export type AppOpenAPI = OpenAPIHono<AppBinding>;
export type AppRouteHandler<R extends RouteConfig> = RouteHandler<R, AppBinding>;
