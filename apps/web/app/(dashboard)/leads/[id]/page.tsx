"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { leadQueryOptions } from "@/lib/api/leads/leads-queries";
import { listAccountsQueryOptions } from "@/lib/api/accounts/accounts-queries";
import { LeadEditor } from "@/components/leads/lead-editor";
import { SendDmCard } from "@/components/leads/send-dm-card";
import { TranscriptCard } from "@/components/leads/transcript-card";
import { ErrorState, LoadingState } from "@/components/data/data-states";
import { StatusBadge } from "@/components/data/status-badge";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data: lead, isPending, isError, refetch } = useQuery(leadQueryOptions(id));
  const { data: accounts } = useQuery(listAccountsQueryOptions());

  return (
    <main className='flex flex-1 flex-col gap-4 p-4'>
      <div className='flex items-center gap-2'>
        <Button variant='ghost' size='icon' asChild>
          <Link href='/leads' aria-label='Back to leads'>
            <ArrowLeft />
          </Link>
        </Button>
        <h1 className='text-lg font-medium'>{lead ? lead.username : "Lead"}</h1>
        {lead ? <StatusBadge kind='lead' value={lead.status} /> : null}
      </div>

      {isPending ? (
        <LoadingState />
      ) : isError || !lead ? (
        <ErrorState title='Could not load lead' onRetry={() => refetch()} />
      ) : (
        <div className='grid gap-4 lg:grid-cols-3'>
          <div className='flex flex-col gap-4 lg:col-span-2'>
            <LeadEditor lead={lead} />
            {lead.painPoints.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Pain points</CardTitle>
                </CardHeader>
                <CardContent className='flex flex-wrap gap-2'>
                  {lead.painPoints.map((p, i) => (
                    <Badge key={i} variant='outline'>
                      {p}
                    </Badge>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </div>

          <div className='flex flex-col gap-4'>
            <Card>
              <CardHeader>
                <CardTitle>Overview</CardTitle>
              </CardHeader>
              <CardContent className='flex flex-col gap-2 text-sm'>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>Interest</span>
                  <StatusBadge kind='interest' value={lead.interestLevel} />
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>Source</span>
                  <span className='capitalize'>{lead.source}</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>Last outreach</span>
                  <span>{formatRelativeTime(lead.lastOutreachAt) || "—"}</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>Created</span>
                  <span>{formatDateTime(lead.createdAt)}</span>
                </div>
              </CardContent>
            </Card>
            <SendDmCard lead={lead} accounts={accounts ?? []} />
            <TranscriptCard lead={lead} />
          </div>
        </div>
      )}
    </main>
  );
}
