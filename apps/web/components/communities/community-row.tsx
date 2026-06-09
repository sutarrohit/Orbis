"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { Community } from "@/lib/api/communities/communities-apis";
import { communityKeys, updateCommunityMutationOptions } from "@/lib/api/communities/communities-queries";
import type { Account } from "@/lib/api/accounts/accounts-apis";
import type { CommunityStatus } from "@/lib/api/enums";
import { GroupMembersDialog } from "@/components/communities/group-members-dialog";
import { StatusBadge } from "@/components/data/status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableCell, TableRow } from "@/components/ui/table";

const UNASSIGNED = "none";

const STATUS_LABELS: Record<CommunityStatus, string> = {
  pending_join: "Pending",
  joined: "Joined",
  rejected: "Rejected"
};

const STATUSES = Object.keys(STATUS_LABELS) as CommunityStatus[];

export function CommunityRow({ community, accounts }: { community: Community; accounts: Account[] }) {
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
        {community.note ? (
          <div className='text-xs italic text-muted-foreground'>{community.note}</div>
        ) : null}
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
        <div className='flex items-center justify-end gap-2'>
          <GroupMembersDialog community={community} />
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
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </TableCell>
    </TableRow>
  );
}
