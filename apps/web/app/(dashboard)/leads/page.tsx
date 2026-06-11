"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Target } from "lucide-react";

import { listLeadsQueryOptions } from "@/lib/api/leads/leads-queries";
import { listCommunitiesQueryOptions } from "@/lib/api/communities/communities-queries";
import { buildCommunityChatMap, communityLabel } from "@/lib/community-source";
import type { LeadStatus } from "@/lib/api/enums";
import { EmptyState, ErrorState, TableLoadingRows } from "@/components/data/data-states";
import { StatusBadge } from "@/components/data/status-badge";
import { LeadStats } from "@/components/leads/lead-stats";
import { formatRelativeTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS: { value: LeadStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "prospect", label: "Prospect" },
  { value: "nurturing", label: "Nurturing" },
  { value: "cold", label: "Cold" },
  { value: "lost", label: "Lost" },
  { value: "converted", label: "Converted" }
];

export default function LeadsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<LeadStatus | "all">("all");
  const params = tab === "all" ? {} : { status: tab };

  const { data: allLeads } = useQuery(listLeadsQueryOptions());
  const { data, isPending, isError, refetch } = useQuery(listLeadsQueryOptions(params));
  const { data: communities } = useQuery(listCommunitiesQueryOptions());
  const communityByChat = useMemo(() => buildCommunityChatMap(communities), [communities]);
  const counts = data?.counts ?? allLeads?.counts;
  const totalCount = counts ? Object.values(counts).reduce((sum, n) => sum + n, 0) : 0;

  return (
    <main className='flex flex-1 flex-col gap-4 p-4'>
      <div>
        <h1 className='text-lg font-medium'>Leads</h1>
        <p className='text-sm text-muted-foreground'>
          Track and manage potential leads from community engagement
        </p>
      </div>

      {allLeads && <LeadStats data={allLeads.data} />}

      <Tabs value={tab} onValueChange={(v) => setTab(v as LeadStatus | "all")}>
        <TabsList>
          {TABS.map((t) => {
            const count = t.value === "all" ? totalCount : (counts?.[t.value] ?? 0);
            return (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
                {counts ? <Badge variant='secondary'>{count}</Badge> : null}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {isError ? (
        <ErrorState title='Could not load leads' onRetry={() => refetch()} />
      ) : !isPending && data && data.data.length === 0 ? (
        <EmptyState
          icon={<Target />}
          title='No leads yet'
          description='Leads appear here as the Talk and Sales agents flag interested users.'
        />
      ) : (
        <div className='rounded-xl border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Interest</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Community</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Last outreach</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending ? (
                <TableLoadingRows columns={7} />
              ) : (
                data?.data.map((lead) => (
                  <TableRow
                    key={lead.id}
                    className='cursor-pointer'
                    onClick={() => router.push(`/leads/${lead.id}`)}
                  >
                    <TableCell className='font-medium'>{lead.username}</TableCell>
                    <TableCell className='text-muted-foreground'>{lead.score}</TableCell>
                    <TableCell>
                      <StatusBadge kind='interest' value={lead.interestLevel} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge kind='lead' value={lead.status} />
                    </TableCell>
                    <TableCell className='text-muted-foreground'>
                      {communityLabel(communityByChat, lead.sourceGroupChatId)}
                    </TableCell>
                    <TableCell className='capitalize text-muted-foreground'>{lead.source}</TableCell>
                    <TableCell className='text-muted-foreground'>
                      {formatRelativeTime(lead.lastOutreachAt) || "—"}
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
