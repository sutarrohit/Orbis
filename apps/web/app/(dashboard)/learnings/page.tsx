"use client";

import { useQuery } from "@tanstack/react-query";
import { Lightbulb } from "lucide-react";

import { listLearningsQueryOptions } from "@/lib/api/learnings/learnings-queries";
import { LearningStats } from "@/components/learnings/learning-stats";
import { EmptyState, ErrorState, TableLoadingRows } from "@/components/data/data-states";
import { formatRelativeTime } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function LearningsPage() {
  const { data, isPending, isError, refetch } = useQuery(listLearningsQueryOptions());

  return (
    <main className='flex flex-1 flex-col gap-4 p-4'>
      <div>
        <h1 className='text-lg font-medium'>Learnings</h1>
        <p className='text-sm text-muted-foreground'>
          Strategy notes and insights accumulated by the Leader agent
        </p>
      </div>

      {data && <LearningStats data={data} />}

      {isError ? (
        <ErrorState title='Could not load learnings' onRetry={() => refetch()} />
      ) : !isPending && data && data.length === 0 ? (
        <EmptyState
          icon={<Lightbulb />}
          title='No learnings yet'
          description='Strategy notes accumulated by the Leader agent will show up here.'
        />
      ) : (
        <div className='rounded-xl border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Learning</TableHead>
                <TableHead className='w-40 text-right'>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending ? (
                <TableLoadingRows columns={2} />
              ) : (
                data?.map((learning) => (
                  <TableRow key={learning.id}>
                    <TableCell className='text-sm'>{learning.text}</TableCell>
                    <TableCell className='text-right text-sm text-muted-foreground'>
                      {formatRelativeTime(learning.createdAt) || "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}
