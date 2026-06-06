"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { AgentType } from "@/lib/api/enums";
import type { SchedulerAction } from "@/lib/api/agents/agents-apis";
import {
  runLeaderMutationOptions,
  runResearchMutationOptions,
  runSearchMutationOptions,
  schedulerActionMutationOptions,
  schedulerKeys,
  schedulerStatusQueryOptions
} from "@/lib/api/agents/agents-queries";
import { listAgentStateQueryOptions } from "@/lib/api/agent-state/agent-state-queries";
import { listLeadsQueryOptions } from "@/lib/api/leads/leads-queries";
import { getUsageQueryOptions } from "@/lib/api/usage/usage-queries";
import { listActivityQueryOptions } from "@/lib/api/activity/activity-queries";
import { StatusBadge } from "@/components/data/status-badge";
import { formatNumber, formatRelativeTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

const AGENTS: AgentType[] = ["leader", "search", "research", "talk", "sales"];
const SCHEDULER_ACTIONS: SchedulerAction[] = ["start", "pause", "resume", "stop"];

function SchedulerCard() {
  const queryClient = useQueryClient();
  const { data, isPending, isError } = useQuery({
    ...schedulerStatusQueryOptions(),
    refetchInterval: 5000
  });

  const actionM = useMutation({
    ...schedulerActionMutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: schedulerKeys.status });
      toast.success("Scheduler updated");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Scheduler action failed")
  });

  const runSearch = useMutation({
    ...runSearchMutationOptions(),
    onSuccess: () => toast.success("Search run started"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Run failed")
  });
  const runResearch = useMutation({
    ...runResearchMutationOptions(),
    onSuccess: () => toast.success("Research run started"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Run failed")
  });
  const runLeader = useMutation({
    ...runLeaderMutationOptions(),
    onSuccess: () => toast.success("Leader run started"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Run failed")
  });
  const anyRunPending = runSearch.isPending || runResearch.isPending || runLeader.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center justify-between'>
          <span>Scheduler</span>
          {!isPending && !isError ? <Badge variant='secondary'>{data?.state}</Badge> : null}
        </CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <p className='text-xs text-muted-foreground'>
          {isError ? "Could not reach the scheduler." : `${data?.jobs.length ?? 0} scheduled job(s).`}
        </p>

        <div className='flex flex-wrap gap-2'>
          {SCHEDULER_ACTIONS.map((action) => (
            <Button
              key={action}
              variant='outline'
              size='sm'
              className='capitalize'
              onClick={() => actionM.mutate(action)}
              disabled={actionM.isPending}
            >
              {action}
            </Button>
          ))}
        </div>

        <div className='flex flex-col gap-2'>
          <span className='text-xs font-medium text-muted-foreground'>Run once</span>
          <div className='flex flex-wrap gap-2'>
            <Button size='sm' onClick={() => runSearch.mutate({})} disabled={anyRunPending}>
              {runSearch.isPending ? <Spinner /> : null}
              Search
            </Button>
            <Button size='sm' onClick={() => runResearch.mutate({})} disabled={anyRunPending}>
              {runResearch.isPending ? <Spinner /> : null}
              Research
            </Button>
            <Button size='sm' onClick={() => runLeader.mutate({})} disabled={anyRunPending}>
              {runLeader.isPending ? <Spinner /> : null}
              Leader
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AgentStateCard() {
  const { data } = useQuery({ ...listAgentStateQueryOptions(), refetchInterval: 5000 });
  const byType = new Map((data ?? []).map((s) => [s.agentType, s]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agents</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        {AGENTS.map((agent) => {
          const state = byType.get(agent);
          return (
            <div key={agent} className='flex items-center justify-between gap-2'>
              <div className='flex flex-col'>
                <span className='text-sm font-medium capitalize'>{agent}</span>
                {state?.currentTask ? (
                  <span className='text-xs text-muted-foreground'>{state.currentTask}</span>
                ) : null}
              </div>
              <StatusBadge kind='agent' value={state?.status ?? "idle"} />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function LeadsCard() {
  const { data } = useQuery(listLeadsQueryOptions());
  const counts = data?.counts;
  const total = counts ? Object.values(counts).reduce((sum, n) => sum + n, 0) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center justify-between'>
          <span>Leads</span>
          <span className='text-2xl font-semibold'>{formatNumber(total)}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-1 text-sm'>
        {counts ? (
          Object.entries(counts).map(([status, n]) => (
            <div key={status} className='flex justify-between'>
              <span className='capitalize text-muted-foreground'>{status}</span>
              <span>{formatNumber(n)}</span>
            </div>
          ))
        ) : (
          <span className='text-muted-foreground'>—</span>
        )}
      </CardContent>
    </Card>
  );
}

function UsageCard() {
  const { data } = useQuery(getUsageQueryOptions({ days: 30 }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage · 30 days</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-1 text-sm'>
        <div className='flex justify-between'>
          <span className='text-muted-foreground'>Total tokens</span>
          <span className='font-medium'>{formatNumber(data?.totals.totalTokens ?? 0)}</span>
        </div>
        <div className='flex justify-between'>
          <span className='text-muted-foreground'>Calls</span>
          <span>{formatNumber(data?.totals.calls ?? 0)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function RecentActivityCard() {
  const { data } = useQuery(listActivityQueryOptions({ limit: 8 }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
      </CardHeader>
      <CardContent>
        {!data || data.length === 0 ? (
          <p className='text-sm text-muted-foreground'>No activity yet.</p>
        ) : (
          <div className='flex flex-col divide-y'>
            {data.map((item) => (
              <div key={item.id} className='flex items-center justify-between gap-2 py-2'>
                <div className='flex items-center gap-2'>
                  <Badge variant='secondary' className='capitalize'>
                    {item.agent}
                  </Badge>
                  <span className='text-sm'>{item.action}</span>
                </div>
                <span className='text-xs text-muted-foreground'>{formatRelativeTime(item.ts)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardHome() {
  return (
    <main className='flex flex-1 flex-col gap-4 p-4'>
      <h1 className='text-lg font-medium'>Dashboard</h1>
      <div className='grid gap-4 lg:grid-cols-3'>
        <SchedulerCard />
        <AgentStateCard />
        <LeadsCard />
        <UsageCard />
        <div className='lg:col-span-2'>
          <RecentActivityCard />
        </div>
      </div>
    </main>
  );
}
