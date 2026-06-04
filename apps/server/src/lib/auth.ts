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
  }
});

export type Session = typeof auth.$Infer.Session;
