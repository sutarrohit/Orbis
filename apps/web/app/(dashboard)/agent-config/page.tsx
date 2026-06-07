"use client";

import { useQuery } from "@tanstack/react-query";

import type { AgentConfig } from "@/lib/api/agent-config/agent-config-apis";
import { listAgentConfigQueryOptions } from "@/lib/api/agent-config/agent-config-queries";
import type { AgentType } from "@/lib/api/enums";
import { AgentConfigForm } from "@/components/agent-config/agent-config-form";
import { ErrorState, LoadingState } from "@/components/data/data-states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const AGENTS: AgentType[] = ["leader", "search", "research", "talk", "sales"];

export default function AgentConfigPage() {
  const { data, isPending, isError, refetch } = useQuery(listAgentConfigQueryOptions());

  const byType = new Map<AgentType, AgentConfig>();
  for (const config of data ?? []) byType.set(config.agentType, config);

  return (
    <main className='flex flex-1 flex-col gap-4 p-4'>
      <h1 className='text-lg font-medium'>Agent Config</h1>

      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState title='Could not load agent config' onRetry={() => refetch()} />
      ) : (
        <Tabs defaultValue={AGENTS[0]}>
          <TabsList>
            {AGENTS.map((agent) => (
              <TabsTrigger key={agent} value={agent} className='capitalize'>
                {agent}
              </TabsTrigger>
            ))}
          </TabsList>
          {AGENTS.map((agent) => (
            <TabsContent key={agent} value={agent}>
              {/* key forces a fresh form when switching agents */}
              <AgentConfigForm key={agent} agentType={agent} config={byType.get(agent)} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </main>
  );
}
