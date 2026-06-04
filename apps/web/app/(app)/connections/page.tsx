"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  connectionKeys,
  createConnectionMutationOptions,
  deleteConnectionMutationOptions,
  listConnectionsQueryOptions
} from "@/lib/api/connections/connection-queries";

const inputClass = cn(
  "h-8 flex-1 rounded-md bg-input/30 px-2.5 text-xs/relaxed ring-1 ring-foreground/10",
  "outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
);

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "ACTIVE"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : status === "ERROR"
        ? "bg-destructive/10 text-destructive"
        : "bg-muted text-muted-foreground";
  return (
    <span className={cn("rounded-sm px-1.5 py-0.5 text-[0.625rem] font-medium", tone)}>{status}</span>
  );
}

export default function ConnectionsPage() {
  const qc = useQueryClient();
  const { data: connections, isPending } = useQuery(listConnectionsQueryOptions());

  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    ...createConnectionMutationOptions(),
    onSuccess: () => {
      setToken("");
      setError(null);
      qc.invalidateQueries({ queryKey: connectionKeys.all });
    },
    onError: (e: Error) => setError(e.message)
  });

  const remove = useMutation({
    ...deleteConnectionMutationOptions(),
    onSuccess: () => qc.invalidateQueries({ queryKey: connectionKeys.all })
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    create.mutate({ platform: "TELEGRAM", token: token.trim() });
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Add a Telegram bot</CardTitle>
          <CardDescription>
            Paste the bot token from @BotFather. We validate it, store it encrypted, and register
            its webhook.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                className={inputClass}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="123456:ABC-DEF…"
                autoComplete="off"
                required
              />
              <Button type="submit" disabled={create.isPending || !token.trim()}>
                {create.isPending ? "Connecting…" : "Connect"}
              </Button>
            </div>
            {error && <p className="text-destructive">{error}</p>}
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <h2 className="px-1 text-xs font-medium text-muted-foreground">Connected bots</h2>
        {isPending ? (
          <p className="px-1 text-xs/relaxed text-muted-foreground">Loading…</p>
        ) : !connections?.length ? (
          <p className="px-1 text-xs/relaxed text-muted-foreground">No bots connected yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {connections.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-card px-3 py-2 ring-1 ring-foreground/10"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-xs/relaxed font-medium">
                    {c.displayName ?? c.externalId}
                  </span>
                  <span className="text-[0.625rem] text-muted-foreground">{c.platform}</span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={c.status} />
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(c.id)}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
