"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleDollarSign, Hash, LetterText, MessageSquareText } from "lucide-react";

import { getUsageQueryOptions } from "@/lib/api/usage/usage-queries";
import type { UsageByAgent } from "@/lib/api/usage/usage-apis";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const PERIODS = [
  { value: 7, label: "7d" },
  { value: 30, label: "30d" },
  { value: 90, label: "90d" }
] as const;

/** Rough cost estimate — $0.15 per 1M input, $0.60 per 1M output (o4-mini pricing). */
function estimateCostUSD(promptTokens: number, completionTokens: number) {
  return (promptTokens * 0.15 + completionTokens * 0.6) / 1_000_000;
}

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatUSD(n: number) {
  return `$${n.toFixed(4)}`;
}

function formatINR(usd: number) {
  const inr = usd * 85;
  return `₹${inr.toFixed(2)}`;
}

function agentLabel(agent: string) {
  return agent.charAt(0).toUpperCase() + agent.slice(1);
}

export function TokenExpenses() {
  const [days, setDays] = useState(30);
  const { data, isPending } = useQuery(getUsageQueryOptions({ days }));

  const totals = data?.totals;
  const costUSD = totals ? estimateCostUSD(totals.promptTokens, totals.completionTokens) : 0;
  const totalTokensAll = totals?.totalTokens ?? 0;

  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between'>
          <CardTitle className='flex items-center gap-2'>
            <div className='flex size-8 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40'>
              <CircleDollarSign className='size-4 text-green-600 dark:text-green-400' />
            </div>
            Token Expenses
          </CardTitle>
          <div className='flex gap-1 rounded-lg bg-muted p-0.5'>
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type='button'
                onClick={() => setDays(p.value)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  days === p.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className='flex flex-col gap-5'>
        {/* Stats row */}
        {isPending ? (
          <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className='h-[72px] rounded-xl' />
            ))}
          </div>
        ) : (
          <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
            <Card size='sm' className='bg-primary text-primary-foreground'>
              <CardContent className='flex items-center gap-3 p-3'>
                <div className='flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/20'>
                  <CircleDollarSign className='size-4 text-primary-foreground' />
                </div>
                <div className='min-w-0'>
                  <p className='truncate text-xs text-primary-foreground/70'>Total Cost (INR)</p>
                  <p className='text-lg font-semibold leading-tight'>{formatINR(costUSD)}</p>
                  <p className='text-[0.6rem] text-primary-foreground/60'>{formatUSD(costUSD)} USD</p>
                </div>
              </CardContent>
            </Card>

            <Card size='sm'>
              <CardContent className='flex items-center gap-3'>
                <div className='flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/40'>
                  <Hash className='size-4 text-blue-600 dark:text-blue-400' />
                </div>
                <div className='min-w-0'>
                  <p className='truncate text-xs text-muted-foreground'>API Calls</p>
                  <p className='text-lg font-semibold leading-tight'>{totals?.calls ?? 0}</p>
                  <p className='text-[0.6rem] text-muted-foreground'>Last {days} days</p>
                </div>
              </CardContent>
            </Card>

            <Card size='sm'>
              <CardContent className='flex items-center gap-3'>
                <div className='flex size-9 shrink-0 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/40'>
                  <LetterText className='size-4 text-orange-600 dark:text-orange-400' />
                </div>
                <div className='min-w-0'>
                  <p className='truncate text-xs text-muted-foreground'>Input Tokens</p>
                  <p className='text-lg font-semibold leading-tight'>{formatTokens(totals?.promptTokens ?? 0)}</p>
                  <p className='text-[0.6rem] text-muted-foreground'>Prompts sent</p>
                </div>
              </CardContent>
            </Card>

            <Card size='sm'>
              <CardContent className='flex items-center gap-3'>
                <div className='flex size-9 shrink-0 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/40'>
                  <MessageSquareText className='size-4 text-green-600 dark:text-green-400' />
                </div>
                <div className='min-w-0'>
                  <p className='truncate text-xs text-muted-foreground'>Output Tokens</p>
                  <p className='text-lg font-semibold leading-tight'>{formatTokens(totals?.completionTokens ?? 0)}</p>
                  <p className='text-[0.6rem] text-muted-foreground'>Responses generated</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Cost by Agent */}
        {!isPending && data?.byAgent && data.byAgent.length > 0 && (
          <div className='flex flex-col gap-3'>
            <p className='text-sm font-medium'>Cost by Agent</p>
            <div className='flex flex-col gap-2'>
              {data.byAgent.map((row: UsageByAgent) => {
                const agentCost = estimateCostUSD(row.promptTokens, row.completionTokens);
                const pct = totalTokensAll > 0 ? (row.totalTokens / totalTokensAll) * 100 : 0;
                return (
                  <div key={row.agent} className='flex flex-col gap-1.5 rounded-lg border p-3'>
                    <div className='flex items-center justify-between'>
                      <div className='flex items-center gap-2'>
                        <span className='text-sm font-medium'>{agentLabel(row.agent)}</span>
                        <Badge variant='secondary' className='text-[0.6rem]'>
                          {row.calls} calls
                        </Badge>
                      </div>
                      <div className='flex items-center gap-3 text-xs text-muted-foreground'>
                        <span>{formatTokens(row.totalTokens)} tokens</span>
                        <span className='font-medium text-foreground'>{formatINR(agentCost)}</span>
                      </div>
                    </div>
                    <div className='h-1.5 w-full overflow-hidden rounded-full bg-muted'>
                      <div
                        className='h-full rounded-full bg-primary transition-all'
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
