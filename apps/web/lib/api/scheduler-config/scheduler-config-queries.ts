import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { getSchedulerConfig, updateSchedulerConfig } from "./scheduler-config-apis";

export const schedulerConfigKeys = {
  config: ["scheduler-config"] as const
};

export function schedulerConfigQueryOptions() {
  return queryOptions({
    queryKey: schedulerConfigKeys.config,
    queryFn: getSchedulerConfig
  });
}

export function updateSchedulerConfigMutationOptions() {
  return mutationOptions({
    mutationKey: ["scheduler-config", "update"],
    mutationFn: updateSchedulerConfig
  });
}
