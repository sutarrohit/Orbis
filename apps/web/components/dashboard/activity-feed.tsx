"use client";

import { useQuery } from "@tanstack/react-query";

import type { AgentType } from "@/lib/api/enums";
import { listActivityQueryOptions } from "@/lib/api/activity/activity-queries";
import { formatRelativeTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const AGENT_COLORS: Record<AgentType, string> = {
  leader: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  search: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  talk: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  research: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  sales: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200"
};

export function ActivityFeed() {
  const { data, isPending } = useQuery({
    ...listActivityQueryOptions({ limit: 15 }),
    refetchInterval: 10000
  });

  return (
    <Card>
      <CardContent className='flex flex-col gap-3 p-4'>
        <h2 className='text-lg font-semibold'>Agent Activity Feed</h2>
        {isPending ? (
          <div className='flex flex-col gap-3'>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className='flex items-center gap-3'>
                <Skeleton className='h-5 w-16 rounded-full' />
                <Skeleton className='h-4 flex-1' />
                <Skeleton className='h-3 w-20' />
              </div>
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <p className='py-4 text-center text-sm text-muted-foreground'>No activity yet.</p>
        ) : (
          <div className='flex flex-col divide-y'>
            {data.map((item) => (
              <div key={item.id} className='flex items-center gap-3 py-2.5'>
                <Badge variant='secondary' className={`shrink-0 capitalize ${AGENT_COLORS[item.agent] ?? ""}`}>
                  {item.agent}
                </Badge>
                <span className='min-w-0 flex-1 truncate text-sm'>{item.action}</span>
                <span className='shrink-0 text-xs text-muted-foreground'>{formatRelativeTime(item.ts)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
