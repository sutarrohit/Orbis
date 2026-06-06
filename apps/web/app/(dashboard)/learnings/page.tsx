"use client";

import { useQuery } from "@tanstack/react-query";
import { Lightbulb } from "lucide-react";

import { listLearningsQueryOptions } from "@/lib/api/learnings/learnings-queries";
import { EmptyState, ErrorState, LoadingState } from "@/components/data/data-states";
import { formatRelativeTime } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";

export default function LearningsPage() {
  const { data, isPending, isError, refetch } = useQuery(listLearningsQueryOptions());

  return (
    <main className='flex flex-1 flex-col gap-4 p-4'>
      <h1 className='text-lg font-medium'>Learnings</h1>

      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState title='Could not load learnings' onRetry={() => refetch()} />
      ) : data && data.length === 0 ? (
        <EmptyState
          icon={<Lightbulb />}
          title='No learnings yet'
          description='Strategy notes accumulated by the Leader agent will show up here.'
        />
      ) : (
        <div className='flex flex-col gap-3'>
          {data?.map((learning) => (
            <Card key={learning.id}>
              <CardContent className='flex flex-col gap-2'>
                <p className='text-sm'>{learning.text}</p>
                <span className='text-xs text-muted-foreground'>{formatRelativeTime(learning.createdAt)}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
