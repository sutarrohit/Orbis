import { queryOptions } from "@tanstack/react-query";
import { listLearnings } from "./learnings-apis";

export const learningKeys = {
  all: ["learnings"] as const
};

export function listLearningsQueryOptions() {
  return queryOptions({
    queryKey: learningKeys.all,
    queryFn: listLearnings
  });
}
