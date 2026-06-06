"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useSession } from "@/lib/auth-client";
import { LoadingState } from "@/components/data/data-states";

/**
 * Client-side auth gate for the dashboard. Resolves the session via the API
 * (`useSession`), which works across the web/API origin split, and redirects to
 * `/sign-in` when there is no session.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (!isPending && !session) router.replace("/sign-in");
  }, [isPending, session, router]);

  if (isPending) return <LoadingState />;
  if (!session) return null; // redirecting to /sign-in

  return <>{children}</>;
}
