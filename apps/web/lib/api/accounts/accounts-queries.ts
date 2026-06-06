import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { deleteAccount, listAccounts, updateAccount, type UpdateAccountInput } from "./accounts-apis";

export const accountKeys = {
  all: ["accounts"] as const
};

export function listAccountsQueryOptions() {
  return queryOptions({
    queryKey: accountKeys.all,
    queryFn: listAccounts
  });
}

export function updateAccountMutationOptions() {
  return mutationOptions({
    mutationKey: ["accounts", "update"],
    mutationFn: ({ id, input }: { id: string; input: UpdateAccountInput }) => updateAccount(id, input)
  });
}

export function deleteAccountMutationOptions() {
  return mutationOptions({
    mutationKey: ["accounts", "delete"],
    mutationFn: (id: string) => deleteAccount(id)
  });
}
