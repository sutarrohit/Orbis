import { request } from "@/utils/request";

/** Global autonomous-scheduler config as returned by `GET /scheduler-config`. */
export interface SchedulerConfig {
  enabled: boolean;
  leaderIntervalMinutes: number;
  followupIntervalMinutes: number;
  updatedAt: string;
}

export interface UpdateSchedulerConfigInput {
  enabled?: boolean;
  leaderIntervalMinutes?: number;
  followupIntervalMinutes?: number;
}

export function getSchedulerConfig(): Promise<SchedulerConfig> {
  return request("/scheduler-config");
}

export function updateSchedulerConfig(input: UpdateSchedulerConfigInput): Promise<SchedulerConfig> {
  return request("/scheduler-config", {
    method: "PUT",
    body: JSON.stringify(input)
  });
}
