"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { authClient, useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/inbox", label: "Inbox" },
  { href: "/connections", label: "Connections" }
];

/** Gates the signed-in app behind a session and renders the nav shell. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (!isPending && !session) router.replace("/sign-in");
  }, [isPending, session, router]);

  if (isPending) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">Loading…</div>
    );
  }
  if (!session) return null; // redirecting

  async function signOut() {
    await authClient.signOut();
    router.replace("/sign-in");
  }

  return (
    <div className="flex min-h-full flex-1">
      <aside className="flex w-48 shrink-0 flex-col gap-1 border-r border-foreground/10 p-3">
        <div className="px-2 py-1.5 text-sm font-medium">Omnia</div>
        <nav className="flex flex-col gap-0.5">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-2 py-1.5 text-xs/relaxed hover:bg-muted",
                pathname.startsWith(item.href) && "bg-muted font-medium"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2">
          <div className="truncate px-2 text-[0.625rem] text-muted-foreground">
            {session.user.email}
          </div>
          <Button variant="outline" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </aside>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
