"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { getBrandQueryOptions } from "@/lib/api/brand/brand-queries";
import { LoadingState } from "@/components/data/data-states";

/**
 * Redirects users without a brand to /onboarding. Must render inside AuthGate
 * (it assumes a session exists, so the brand request is authenticated).
 */
export function BrandGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data, isPending } = useQuery(getBrandQueryOptions());

  const hasNoBrand = !isPending && data?.brand == null;

  useEffect(() => {
    if (hasNoBrand) router.replace("/onboarding");
  }, [hasNoBrand, router]);

  if (isPending) return <LoadingState />;
  if (hasNoBrand) return null; // redirecting to /onboarding

  return <>{children}</>;
}
