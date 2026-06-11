import { z } from "@hono/zod-openapi";
import { dateField } from "./common.schema.js";

const MINUTES = z.number().int().min(1).max(1440);

export const SchedulerConfigSchema = z
  .object({
    enabled: z.boolean(),
    leaderIntervalMinutes: MINUTES,
    followupIntervalMinutes: MINUTES,
    updatedAt: dateField(),
  })
  .openapi("SchedulerConfig");

export const UpdateSchedulerConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    leaderIntervalMinutes: MINUTES.optional(),
    followupIntervalMinutes: MINUTES.optional(),
  })
  .openapi("UpdateSchedulerConfig");

export type UpdateSchedulerConfigInput = z.infer<typeof UpdateSchedulerConfigSchema>;
