"use client";

import { useQuery } from "@tanstack/react-query";

import { getBrandQueryOptions } from "@/lib/api/brand/brand-queries";

/**
 * Returns the current user's brand (or null while loading / when absent).
 * Pages rendered inside the dashboard can assume a brand exists, since the
 * BrandGate redirects users without one to /onboarding.
 */
export function useBrand() {
  const query = useQuery(getBrandQueryOptions());
  return { brand: query.data?.brand ?? null, isPending: query.isPending };
}
