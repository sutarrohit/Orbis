import { queryOptions } from "@tanstack/react-query";
import { listActivity, type ListActivityParams } from "./activity-apis";

export const activityKeys = {
  all: ["activity"] as const,
  list: (params: ListActivityParams) => ["activity", params] as const
};

export function listActivityQueryOptions(params: ListActivityParams = {}) {
  return queryOptions({
    queryKey: activityKeys.list(params),
    queryFn: () => listActivity(params)
  });
}
