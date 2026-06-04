import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { createConnection, deleteConnection, listConnections } from "./connection-apis";

export const connectionKeys = {
  all: ["connections"] as const
};

export function listConnectionsQueryOptions() {
  return queryOptions({
    queryKey: connectionKeys.all,
    queryFn: listConnections
  });
}

export function createConnectionMutationOptions() {
  return mutationOptions({
    mutationKey: ["connections", "create"],
    mutationFn: createConnection
  });
}

export function deleteConnectionMutationOptions() {
  return mutationOptions({
    mutationKey: ["connections", "delete"],
    mutationFn: deleteConnection
  });
}
