"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getUsageQueryOptions } from "@/lib/api/usage/usage-queries";
import { ErrorState, LoadingState } from "@/components/data/data-states";
import { StatCard } from "@/components/usage/stat-card";
import { formatNumber } from "@/lib/format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const RANGES = [7, 30, 90];

export default function UsagePage() {
  const [days, setDays] = useState(30);
  const { data, isPending, isError, refetch } = useQuery(getUsageQueryOptions({ days }));

  return (
    <main className='flex flex-1 flex-col gap-4 p-4'>
      <div className='flex items-center justify-between'>
        <h1 className='text-lg font-medium'>Usage</h1>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className='w-36'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((r) => (
              <SelectItem key={r} value={String(r)}>
                Last {r} days
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isPending ? (
        <LoadingState />
      ) : isError || !data ? (
        <ErrorState title='Could not load usage' onRetry={() => refetch()} />
      ) : (
        <div className='flex flex-col gap-4'>
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
            <StatCard label='Total tokens' value={data.totals.totalTokens} />
            <StatCard label='Prompt tokens' value={data.totals.promptTokens} />
            <StatCard label='Completion tokens' value={data.totals.completionTokens} />
            <StatCard label='Calls' value={data.totals.calls} />
          </div>

          <div className='rounded-xl border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead className='text-right'>Prompt</TableHead>
                  <TableHead className='text-right'>Completion</TableHead>
                  <TableHead className='text-right'>Total</TableHead>
                  <TableHead className='text-right'>Calls</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byAgent.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className='text-center text-muted-foreground'>
                      No usage in this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.byAgent.map((row) => (
                    <TableRow key={row.agent}>
                      <TableCell className='font-medium capitalize'>{row.agent}</TableCell>
                      <TableCell className='text-right text-muted-foreground'>
                        {formatNumber(row.promptTokens)}
                      </TableCell>
                      <TableCell className='text-right text-muted-foreground'>
                        {formatNumber(row.completionTokens)}
                      </TableCell>
                      <TableCell className='text-right'>{formatNumber(row.totalTokens)}</TableCell>
                      <TableCell className='text-right text-muted-foreground'>{formatNumber(row.calls)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </main>
  );
}
