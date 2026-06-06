import { AppOpenAPI } from "./types.js";
import { swaggerUI } from "@hono/swagger-ui";
import packageJSON from "../../package.json" with { type: "json" };

export function configureOpenAPI(app: AppOpenAPI) {
  // Authenticated routes carry `security: [{ cookieAuth: [] }]`; declare the
  // scheme here so Swagger renders the lock and documents the session cookie.
  app.openAPIRegistry.registerComponent("securitySchemes", "cookieAuth", {
    type: "apiKey",
    in: "cookie",
    name: "better-auth.session_token"
  });

  app.doc("/doc", {
    openapi: "3.0.0",
    info: {
      version: packageJSON.version,
      title: "Orbis API"
    }
  });

  app.get(
    "/swagger",
    swaggerUI({
      url: "/doc"
    })
  );
}
