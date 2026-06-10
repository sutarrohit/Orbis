import "dotenv/config";
import { defineConfig } from "prisma/config";

// Read DIRECT_URL straight from the environment rather than the app's strict
// `./src/env.js` validator. That validator process.exit()s when ANY runtime
// secret is missing, which breaks `prisma generate` during `docker build` —
// generate only needs the schema (no DB connection), and the runtime .env is
// injected later via compose `env_file`. The placeholder keeps `generate`
// happy at build time; real migrate/db commands get the real URL at runtime
// (and fail with a clear connection error if it's genuinely unset).
const directUrl =
  process.env.DIRECT_URL ??
  "postgresql://placeholder:placeholder@localhost:5432/placeholder";

export default defineConfig({
  engine: "classic",
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  },
  datasource: {
    url: directUrl,
    directUrl
  }
});
