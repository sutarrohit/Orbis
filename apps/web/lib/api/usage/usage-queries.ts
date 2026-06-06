import { queryOptions } from "@tanstack/react-query";
import { getUsage, type GetUsageParams } from "./usage-apis";

export const usageKeys = {
  all: ["usage"] as const,
  summary: (params: GetUsageParams) => ["usage", params] as const
};

export function getUsageQueryOptions(params: GetUsageParams = {}) {
  return queryOptions({
    queryKey: usageKeys.summary(params),
    queryFn: () => getUsage(params)
  });
}
