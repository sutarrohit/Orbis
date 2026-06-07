"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";

import { listCommunitiesQueryOptions } from "@/lib/api/communities/communities-queries";
import { listAccountsQueryOptions } from "@/lib/api/accounts/accounts-queries";
import type { CommunityStatus } from "@/lib/api/enums";
import { AddCommunityDialog } from "@/components/communities/add-community-dialog";
import { CommunityRow } from "@/components/communities/community-row";
import { CommunityStats } from "@/components/communities/community-stats";
import { EmptyState, ErrorState, TableLoadingRows } from "@/components/data/data-states";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS: { value: CommunityStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending_join", label: "Pending" },
  { value: "joined", label: "Joined" },
  { value: "rejected", label: "Rejected" }
];

export default function CommunitiesPage() {
  const [tab, setTab] = useState<CommunityStatus | "all">("all");
  const params = tab === "all" ? {} : { status: tab };

  const { data: allCommunities } = useQuery(listCommunitiesQueryOptions());
  const { data, isPending, isError, refetch } = useQuery(listCommunitiesQueryOptions(params));
  const { data: accounts } = useQuery(listAccountsQueryOptions());

  return (
    <main className='flex flex-1 flex-col gap-4 p-4'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-lg font-medium'>Communities</h1>
          <p className='text-sm text-muted-foreground'>
            Track and manage your joined communities across platforms
          </p>
        </div>
        <AddCommunityDialog />
      </div>

      {allCommunities && <CommunityStats data={allCommunities} />}

      <Tabs value={tab} onValueChange={(v) => setTab(v as CommunityStatus | "all")}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isError ? (
        <ErrorState title='Could not load communities' onRetry={() => refetch()} />
      ) : !isPending && data && data.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title='No communities here'
          description='Run the Search agent or add a community manually to get started.'
        />
      ) : (
        <div className='rounded-xl border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Community</TableHead>
                <TableHead>Relevance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned account</TableHead>
                <TableHead className='text-right'>Set status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending ? (
                <TableLoadingRows columns={5} />
              ) : (
                data?.map((community) => (
                  <CommunityRow key={community.id} community={community} accounts={accounts ?? []} />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}
