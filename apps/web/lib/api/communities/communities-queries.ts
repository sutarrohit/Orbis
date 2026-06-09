import { mutationOptions, queryOptions } from "@tanstack/react-query";
import {
  createCommunity,
  deleteCommunity,
  listCommunities,
  updateCommunity,
  type ListCommunitiesParams,
  type UpdateCommunityInput
} from "./communities-apis";

export const communityKeys = {
  all: ["communities"] as const,
  list: (params: ListCommunitiesParams) => ["communities", params] as const
};

export function listCommunitiesQueryOptions(params: ListCommunitiesParams = {}) {
  return queryOptions({
    queryKey: communityKeys.list(params),
    queryFn: () => listCommunities(params)
  });
}

export function createCommunityMutationOptions() {
  return mutationOptions({
    mutationKey: ["communities", "create"],
    mutationFn: createCommunity
  });
}

export function updateCommunityMutationOptions() {
  return mutationOptions({
    mutationKey: ["communities", "update"],
    mutationFn: ({ id, input }: { id: string; input: UpdateCommunityInput }) => updateCommunity(id, input)
  });
}

export function deleteCommunityMutationOptions() {
  return mutationOptions({
    mutationKey: ["communities", "delete"],
    mutationFn: deleteCommunity
  });
}
