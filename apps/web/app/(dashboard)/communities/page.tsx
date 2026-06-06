"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users } from "lucide-react";

import type { Community } from "@/lib/api/communities/communities-apis";
import {
  communityKeys,
  listCommunitiesQueryOptions,
  updateCommunityMutationOptions
} from "@/lib/api/communities/communities-queries";
import type { Account } from "@/lib/api/accounts/accounts-apis";
import { listAccountsQueryOptions } from "@/lib/api/accounts/accounts-queries";
import type { CommunityStatus } from "@/lib/api/enums";
import { AddCommunityDialog } from "@/components/communities/add-community-dialog";
import { EmptyState, ErrorState, TableLoadingRows } from "@/components/data/data-states";
import { StatusBadge } from "@/components/data/status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const STATUSES: CommunityStatus[] = ["pending_join", "joined", "rejected"];
const UNASSIGNED = "none";

const TABS: { value: CommunityStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending_join", label: "Pending" },
  { value: "joined", label: "Joined" },
  { value: "rejected", label: "Rejected" }
];

function CommunityRow({ community, accounts }: { community: Community; accounts: Account[] }) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: communityKeys.all });

  const { mutate, isPending } = useMutation({
    ...updateCommunityMutationOptions(),
    onSuccess: () => {
      invalidate();
      toast.success("Community updated");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Update failed")
  });

  return (
    <TableRow>
      <TableCell>
        <div className='font-medium'>{community.name || community.handle}</div>
        <div className='text-xs text-muted-foreground'>{community.handle}</div>
      </TableCell>
      <TableCell className='text-muted-foreground'>{community.nicheRelevance}</TableCell>
      <TableCell>
        <StatusBadge kind='community' value={community.status} />
      </TableCell>
      <TableCell>
        <Select
          value={community.assignedAccountId ?? UNASSIGNED}
          onValueChange={(value) =>
            mutate({ id: community.id, input: { assignedAccountId: value === UNASSIGNED ? null : value } })
          }
          disabled={isPending}
        >
          <SelectTrigger size='sm' className='w-40'>
            <SelectValue placeholder='Unassigned' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.handle}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <div className='flex justify-end'>
          <Select
            value={community.status}
            onValueChange={(value) => mutate({ id: community.id, input: { status: value as CommunityStatus } })}
            disabled={isPending}
          >
            <SelectTrigger size='sm' className='w-36'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {TABS.find((t) => t.value === s)?.label ?? s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function CommunitiesPage() {
  const [tab, setTab] = useState<CommunityStatus | "all">("all");
  const params = tab === "all" ? {} : { status: tab };

  const { data, isPending, isError, refetch } = useQuery(listCommunitiesQueryOptions(params));
  const { data: accounts } = useQuery(listAccountsQueryOptions());

  return (
    <main className='flex flex-1 flex-col gap-4 p-4'>
      <div className='flex items-center justify-between'>
        <h1 className='text-lg font-medium'>Communities</h1>
        <AddCommunityDialog />
      </div>

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
