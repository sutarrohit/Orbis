"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity as ActivityIcon, ChevronRight } from "lucide-react";

import { listActivityQueryOptions } from "@/lib/api/activity/activity-queries";
import type { AgentType } from "@/lib/api/enums";
import { EmptyState, ErrorState, LoadingState } from "@/components/data/data-states";
import { formatRelativeTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "all";
const AGENTS: AgentType[] = ["leader", "search", "research", "talk", "sales"];

export default function ActivityPage() {
  const [agent, setAgent] = useState<AgentType | typeof ALL>(ALL);
  const params = agent === ALL ? {} : { agent };

  const { data, isPending, isError, refetch } = useQuery(listActivityQueryOptions(params));

  return (
    <main className='flex flex-1 flex-col gap-4 p-4'>
      <h1 className='text-lg font-medium'>Activity</h1>

      <Select value={agent} onValueChange={(v) => setAgent(v as AgentType | typeof ALL)}>
        <SelectTrigger className='w-48'>
          <SelectValue placeholder='All agents' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All agents</SelectItem>
          {AGENTS.map((a) => (
            <SelectItem key={a} value={a} className='capitalize'>
              {a}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState title='Could not load activity' onRetry={() => refetch()} />
      ) : data && data.length === 0 ? (
        <EmptyState icon={<ActivityIcon />} title='No activity yet' description='Agent actions will appear here.' />
      ) : (
        <div className='flex flex-col divide-y rounded-xl border'>
          {data?.map((item) => (
            <div key={item.id} className='p-3'>
              <div className='flex items-center justify-between gap-2'>
                <div className='flex items-center gap-2'>
                  <Badge variant='secondary' className='capitalize'>
                    {item.agent}
                  </Badge>
                  <span className='text-sm'>{item.action}</span>
                </div>
                <span className='text-xs text-muted-foreground'>{formatRelativeTime(item.ts)}</span>
              </div>
              {item.detail ? (
                <Collapsible className='mt-2'>
                  <CollapsibleTrigger className='group/det flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground'>
                    <ChevronRight className='size-3 transition-transform group-data-[state=open]/det:rotate-90' />
                    Details
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <pre className='mt-1 overflow-x-auto rounded-md bg-muted p-2 text-xs'>
                      {JSON.stringify(item.detail, null, 2)}
                    </pre>
                  </CollapsibleContent>
                </Collapsible>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
