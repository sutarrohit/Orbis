"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CrownIcon, SearchIcon, MessageSquareIcon, NetworkIcon, ShoppingCartIcon, ChevronDownIcon } from "lucide-react";

import type { AgentConfig } from "@/lib/api/agent-config/agent-config-apis";
import { listAgentConfigQueryOptions } from "@/lib/api/agent-config/agent-config-queries";
import type { AgentType } from "@/lib/api/enums";
import { AgentConfigForm } from "@/components/agent-config/agent-config-form";
import { ErrorState, LoadingState } from "@/components/data/data-states";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

const AGENT_META: Record<
  AgentType,
  {
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    borderColor: string;
    iconBg: string;
  }
> = {
  leader: {
    label: "Leader",
    description: "Plans & executes the full agent strategy cycle",
    icon: CrownIcon,
    color: "text-amber-500",
    borderColor: "border-amber-500/30",
    iconBg: "bg-amber-500/15"
  },
  search: {
    label: "Search",
    description: "Finds and evaluates new communities to join",
    icon: SearchIcon,
    color: "text-blue-500",
    borderColor: "border-blue-500/30",
    iconBg: "bg-blue-500/15"
  },
  talk: {
    label: "Talk",
    description: "Engages in community conversations naturally",
    icon: MessageSquareIcon,
    color: "text-emerald-500",
    borderColor: "border-emerald-500/30",
    iconBg: "bg-emerald-500/15"
  },
  research: {
    label: "Research",
    description: "Analyzes community members to find leads",
    icon: NetworkIcon,
    color: "text-purple-500",
    borderColor: "border-purple-500/30",
    iconBg: "bg-purple-500/15"
  },
  sales: {
    label: "Sales",
    description: "Handles DM outreach & follow-ups",
    icon: ShoppingCartIcon,
    color: "text-rose-500",
    borderColor: "border-rose-500/30",
    iconBg: "bg-rose-500/15"
  }
};

const AGENT_ORDER: AgentType[] = ["leader", "search", "talk", "research", "sales"];

export default function AgentConfigPage() {
  const { data, isPending, isError, refetch } = useQuery(listAgentConfigQueryOptions());
  const [expandedAgent, setExpandedAgent] = useState<AgentType | null>(null);

  const byType = new Map<AgentType, AgentConfig>();
  for (const config of data ?? []) byType.set(config.agentType, config);

  if (isPending) {
    return (
      <main className='flex flex-1 flex-col gap-4 p-4 md:p-6'>
        <LoadingState />
      </main>
    );
  }

  if (isError) {
    return (
      <main className='flex flex-1 flex-col gap-4 p-4 md:p-6'>
        <ErrorState title='Could not load agent config' onRetry={() => refetch()} />
      </main>
    );
  }

  return (
    <main className='flex flex-1 flex-col gap-6 p-4 md:p-6'>
      {/* Header */}
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>Agent Configuration</h1>
        <p className='mt-1 text-sm text-muted-foreground'>
          Fine-tune each agent&apos;s personality, voice, behavior rules, and knowledge base. Click an agent to expand
          its settings.
        </p>
      </div>

      {/* Agent summary cards */}
      <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-5'>
        {AGENT_ORDER.map((agentType) => {
          const meta = AGENT_META[agentType];
          const config = byType.get(agentType);
          const enabled = config?.enabled ?? true;
          const Icon = meta.icon;

          return (
            <Card
              key={agentType}
              className={cn(
                "cursor-pointer border-l-4 p-4 transition-colors hover:bg-muted/50",
                meta.borderColor,
                expandedAgent === agentType && "ring-1 ring-ring"
              )}
              onClick={() => setExpandedAgent(expandedAgent === agentType ? null : agentType)}
            >
              <div className='flex items-center gap-3'>
                <div className={cn("flex size-9 items-center justify-center rounded-lg", meta.iconBg)}>
                  <Icon className={cn("size-5", meta.color)} />
                </div>
                <div className='min-w-0 flex-1'>
                  <p className='text-sm font-semibold'>{meta.label}</p>
                  <p className='truncate text-xs text-muted-foreground'>{config?.personaName || "No persona"}</p>
                </div>
              </div>
              <div className='mt-2'>
                <Badge
                  variant={enabled ? "default" : "secondary"}
                  className={cn(
                    "text-[0.6rem]",
                    enabled
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {enabled ? "ON" : "OFF"}
                </Badge>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Agent accordion list */}
      <div className='flex flex-col gap-2'>
        {AGENT_ORDER.map((agentType) => {
          const meta = AGENT_META[agentType];
          const config = byType.get(agentType);
          const enabled = config?.enabled ?? true;
          const isOpen = expandedAgent === agentType;
          const Icon = meta.icon;

          return (
            <Collapsible
              key={agentType}
              open={isOpen}
              onOpenChange={(open) => setExpandedAgent(open ? agentType : null)}
            >
              <Card className='overflow-hidden p-0'>
                <CollapsibleTrigger className='flex w-full items-center gap-4 p-4 py-6 text-left transition-colors hover:bg-muted/50'>
                  <div className={cn("flex size-10 items-center justify-center rounded-lg", meta.iconBg)}>
                    <Icon className={cn("size-5", meta.color)} />
                  </div>
                  <div className='min-w-0 flex-1'>
                    <div className='flex items-center gap-2'>
                      <span className='font-semibold'>{meta.label} Agent</span>
                      {enabled && (
                        <Badge
                          variant='default'
                          className='bg-emerald-500/15 text-[0.6rem] text-emerald-600 dark:text-emerald-400'
                        >
                          ACTIVE
                        </Badge>
                      )}
                    </div>
                    <p className='mt-0.5 text-sm text-muted-foreground'>{meta.description}</p>
                  </div>
                  <ChevronDownIcon
                    className={cn(
                      "size-5 shrink-0 text-muted-foreground transition-transform duration-200",
                      isOpen && "rotate-180"
                    )}
                  />
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className='border-t px-4 py-6'>
                    <AgentConfigForm key={agentType} agentType={agentType} config={config} />
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}
      </div>
    </main>
  );
}
