"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CrownIcon, MessageSquareIcon, NetworkIcon, SearchIcon, ShoppingCartIcon } from "lucide-react";

import type { AgentType } from "@/lib/api/enums";
import {
  runLeaderMutationOptions,
  runResearchMutationOptions,
  runSearchMutationOptions,
  schedulerKeys
} from "@/lib/api/agents/agents-queries";
import { listAgentStateQueryOptions } from "@/lib/api/agent-state/agent-state-queries";
import { StatusBadge } from "@/components/data/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

const AGENT_META: Record<AgentType, { label: string; description: string; icon: React.ReactNode; runnable: boolean }> = {
  leader: {
    label: "Leader",
    description: "Plans & executes the full agent strategy cycle",
    icon: <CrownIcon className='size-5' />,
    runnable: true
  },
  search: {
    label: "Search",
    description: "Finds and evaluates new communities to join",
    icon: <SearchIcon className='size-5' />,
    runnable: true
  },
  talk: {
    label: "Talk",
    description: "Engages in community conversations naturally",
    icon: <MessageSquareIcon className='size-5' />,
    runnable: false
  },
  research: {
    label: "Research",
    description: "Analyzes community members to find leads",
    icon: <NetworkIcon className='size-5' />,
    runnable: true
  },
  sales: {
    label: "Sales",
    description: "Handles DM outreach & follow-ups",
    icon: <ShoppingCartIcon className='size-5' />,
    runnable: false
  }
};

const AGENT_ORDER: AgentType[] = ["leader", "search", "talk", "research", "sales"];

export function AgentControlCenter() {
  const queryClient = useQueryClient();
  const { data: agentStates } = useQuery({
    ...listAgentStateQueryOptions(),
    refetchInterval: 5000
  });
  const byType = new Map((agentStates ?? []).map((s) => [s.agentType, s]));

  const runSearch = useMutation({
    ...runSearchMutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: schedulerKeys.status });
      toast.success("Search run started");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Run failed")
  });
  const runResearch = useMutation({
    ...runResearchMutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: schedulerKeys.status });
      toast.success("Research run started");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Run failed")
  });
  const runLeader = useMutation({
    ...runLeaderMutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: schedulerKeys.status });
      toast.success("Leader cycle started");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Run failed")
  });

  const anyRunPending = runSearch.isPending || runResearch.isPending || runLeader.isPending;

  function getRunner(agentType: AgentType) {
    switch (agentType) {
      case "leader":
        return { mutation: runLeader, label: "Run Cycle" };
      case "search":
        return { mutation: runSearch, label: "Run Search" };
      case "research":
        return { mutation: runResearch, label: "Run Research" };
      default:
        return null;
    }
  }

  return (
    <div className='space-y-4'>
      <h2 className='text-lg font-semibold'>Agent Control Center</h2>
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-5'>
        {AGENT_ORDER.map((agentType) => {
          const meta = AGENT_META[agentType];
          const state = byType.get(agentType);
          const status = state?.status ?? "idle";
          const runner = getRunner(agentType);
          const isRunning = status === "running";

          return (
            <Card key={agentType} className='flex flex-col'>
              <CardContent className='flex flex-1 flex-col gap-3 p-4'>
                <div className='flex items-center justify-between'>
                  <div className='flex items-center gap-2'>
                    {meta.icon}
                    <span className='font-semibold'>{meta.label}</span>
                  </div>
                  <StatusBadge kind='agent' value={status} />
                </div>

                <p className='flex-1 text-xs text-muted-foreground'>{meta.description}</p>

                {state?.currentTask ? (
                  <p className='text-xs italic text-muted-foreground'>{state.currentTask}</p>
                ) : null}

                {runner ? (
                  <Button
                    size='sm'
                    className='w-full'
                    onClick={() => runner.mutation.mutate({})}
                    disabled={anyRunPending || isRunning}
                  >
                    {runner.mutation.isPending ? <Spinner className='mr-1' /> : null}
                    {runner.label}
                  </Button>
                ) : (
                  <Button size='sm' className='w-full' disabled={true}>
                    Event-driven
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
