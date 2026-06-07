"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity as ActivityIcon, Filter } from "lucide-react";

import { listActivityQueryOptions } from "@/lib/api/activity/activity-queries";
import type { Activity } from "@/lib/api/activity/activity-apis";
import type { AgentType } from "@/lib/api/enums";
import { ActivityRow } from "@/components/activity/activity-row";
import { ActivityStats } from "@/components/activity/activity-stats";
import { LeaderPlanDetail } from "@/components/activity/leader-plan-detail";
import { EmptyState, ErrorState, LoadingState } from "@/components/data/data-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "all";
const AGENTS: AgentType[] = ["leader", "search", "research", "talk", "sales"];

function extractUniqueActions(data: Activity[]): string[] {
  return [...new Set(data.map((e) => e.action))].sort();
}

function findLatestLeaderPlan(data: Activity[]): Activity | undefined {
  return data.find((e) => e.agent === "leader" && e.action === "set_plan");
}

export default function ActivityPage() {
  const [agentFilter, setAgentFilter] = useState<AgentType | typeof ALL>(ALL);
  const [actionFilter, setActionFilter] = useState<string>(ALL);
  const [autoScroll, setAutoScroll] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  const { data, isPending, isError, refetch } = useQuery({
    ...listActivityQueryOptions({}),
    refetchInterval: 10_000
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((e) => {
      if (agentFilter !== ALL && e.agent !== agentFilter) return false;
      if (actionFilter !== ALL && e.action !== actionFilter) return false;
      return true;
    });
  }, [data, agentFilter, actionFilter]);

  const uniqueActions = useMemo(() => (data ? extractUniqueActions(data) : []), [data]);
  const latestPlan = useMemo(() => (data ? findLatestLeaderPlan(data) : undefined), [data]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered, autoScroll]);

  return (
    <main className="flex flex-1 flex-col gap-5 p-4 md:p-6">
      {/* header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Agent Activity</h1>
          <p className="text-sm text-muted-foreground">
            Full history of every decision, action, and discovery across all agents
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block size-2 rounded-full bg-muted-foreground/40" />
          History{data ? ` · ${data.length} events` : ""}
        </div>
      </div>

      {/* stats row */}
      {data && <ActivityStats data={data} />}

      {/* filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Filter className="size-4 text-muted-foreground" />

        <Select value={agentFilter} onValueChange={(v) => setAgentFilter(v as AgentType | typeof ALL)}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue placeholder="All Agents" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Agents</SelectItem>
            {AGENTS.map((a) => (
              <SelectItem key={a} value={a} className="capitalize">
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Types</SelectItem>
            {uniqueActions.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <Checkbox id="auto-scroll" checked={autoScroll} onCheckedChange={(v) => setAutoScroll(v === true)} />
          <label htmlFor="auto-scroll" className="cursor-pointer text-xs text-muted-foreground select-none">
            Auto-scroll
          </label>
        </div>
      </div>

      {/* main content */}
      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState title="Could not load activity" onRetry={() => refetch()} />
      ) : data && data.length === 0 ? (
        <EmptyState icon={<ActivityIcon />} title="No activity yet" description="Agent actions will appear here." />
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_380px]">
          {/* event log */}
          <Card className="flex min-h-0 flex-col overflow-hidden">
            <div ref={scrollRef} className="flex-1 overflow-y-auto">
              <div className="flex flex-col divide-y">
                {filtered.map((item) => (
                  <ActivityRow key={item.id} item={item} />
                ))}
                {filtered.length === 0 && (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No events match the current filters.
                  </p>
                )}
              </div>
            </div>
          </Card>

          {/* latest leader plan */}
          <Card className="flex flex-col self-start">
            <CardHeader>
              <CardTitle>Latest Leader Plan</CardTitle>
            </CardHeader>
            <CardContent>
              {latestPlan?.detail ? (
                <LeaderPlanDetail detail={latestPlan.detail} />
              ) : (
                <p className="text-sm text-muted-foreground">No leader plan recorded yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}
