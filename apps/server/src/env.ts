import { config } from "dotenv";
import { expand } from "dotenv-expand";
import path from "node:path";
import { z } from "zod";

expand(
  config({
    path: path.resolve(process.cwd(), process.env.NODE_ENV === "test" ? ".env.test" : ".env")
  })
);

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(4000),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]),
  DATABASE_URL: z.url(),
  DIRECT_URL: z.url(),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(16), // random string you generate
  PUBLIC_URL: z.url(), // public base URL used to register the webhook

  // Better Auth
  BETTER_AUTH_SECRET: z.string().min(16), // random secret used to sign sessions/tokens
  BETTER_AUTH_URL: z.url().default("http://localhost:4000"), // base URL the auth server runs on
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),

  // Python agent service. AGENTS_JWT_SECRET is the shared HS256 secret used to
  // sign the service token Hono sends; the same value must be set on the Python
  // side so it can verify the token.
  AGENTS_SERVICE_URL: z.url().default("http://localhost:8000"),
  AGENTS_JWT_SECRET: z.string().min(1),

  // Set when the web app and API run on different subdomains of one parent
  // (e.g. app.orbist.space + api.orbist.space) so the session cookie is written
  // on the shared parent and both can read it. Use a leading dot:
  // COOKIE_DOMAIN=".orbist.space". Leave unset for single-origin localhost dev.
  COOKIE_DOMAIN: z.string().optional()
});

export type env = z.infer<typeof EnvSchema>;

const { data: env, error } = EnvSchema.safeParse(process.env);

if (error) {
  console.error("❌ Invalid env | Missing env:");
  console.error(JSON.stringify(z.flattenError(error).fieldErrors, null, 2));
  process.exit(1);
}

export default env!;
