import { prisma } from "../lib/prisma.js";
import type { UpdateSchedulerConfigInput } from "../schemas/scheduler-config.schema.js";

// The scheduler config is global, not per-brand, so it lives in a single row
// with a fixed id. Both reads and writes upsert that row, so it always exists.
const CONFIG_ID = "global";

/** Read the singleton scheduler config, creating it with schema defaults if absent. */
export function getSchedulerConfig() {
  return prisma.schedulerConfig.upsert({
    where: { id: CONFIG_ID },
    create: { id: CONFIG_ID },
    update: {},
  });
}

/** Patch the singleton scheduler config (only provided fields change). */
export function updateSchedulerConfig(data: UpdateSchedulerConfigInput) {
  return prisma.schedulerConfig.upsert({
    where: { id: CONFIG_ID },
    create: { id: CONFIG_ID, ...data },
    update: data,
  });
}
