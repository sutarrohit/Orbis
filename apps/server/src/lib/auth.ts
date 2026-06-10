import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma.js";
import env from "../env.js";

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  basePath: "/api/auth",
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  // Web app talks to the API cross-origin, so its origin must be trusted.
  trustedOrigins: [env.FRONTEND_URL],
  emailAndPassword: {
    enabled: true
  },
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET
    }
  },
  // When set (e.g. ".orbist.space"), write the session cookie on the shared
  // parent domain so the web app on a sibling subdomain (app.orbist.space) and
  // the API (api.orbist.space) can both read it. Without this, the cookie is
  // scoped to the API host only, so the web middleware never sees the session
  // and bounces logged-in users back to /sign-in. Unset in local dev.
  ...(env.COOKIE_DOMAIN
    ? {
        advanced: {
          crossSubDomainCookies: {
            enabled: true,
            domain: env.COOKIE_DOMAIN
          }
        }
      }
    : {})
});

export type Session = typeof auth.$Infer.Session;
