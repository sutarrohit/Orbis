import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { createBrand, getBrand, updateBrand } from "./brand-apis";

export const brandKeys = {
  all: ["brand"] as const
};

export function getBrandQueryOptions() {
  return queryOptions({
    queryKey: brandKeys.all,
    queryFn: getBrand
  });
}

export function createBrandMutationOptions() {
  return mutationOptions({
    mutationKey: ["brand", "create"],
    mutationFn: createBrand
  });
}

export function updateBrandMutationOptions() {
  return mutationOptions({
    mutationKey: ["brand", "update"],
    mutationFn: updateBrand
  });
}
