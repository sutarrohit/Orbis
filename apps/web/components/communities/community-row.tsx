"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2Icon } from "lucide-react";

import type { Community } from "@/lib/api/communities/communities-apis";
import {
  communityKeys,
  deleteCommunityMutationOptions,
  updateCommunityMutationOptions
} from "@/lib/api/communities/communities-queries";
import type { Account } from "@/lib/api/accounts/accounts-apis";
import type { CommunityStatus } from "@/lib/api/enums";
import { GroupMembersDialog } from "@/components/communities/group-members-dialog";
import { StatusBadge } from "@/components/data/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
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

  const remove = useMutation({
    ...deleteCommunityMutationOptions(),
    onSuccess: () => {
      invalidate();
      toast.success("Community removed — leaving the chat & clearing its data");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Delete failed")
  });

  const busy = isPending || remove.isPending;

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
          disabled={busy}
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
            disabled={busy}
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

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant='ghost' size='icon' className='text-muted-foreground hover:text-destructive' disabled={busy}>
                <Trash2Icon className='size-4' />
                <span className='sr-only'>Delete community</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {community.name || community.handle}?</AlertDialogTitle>
                <AlertDialogDescription>
                  The assigned account will leave the Telegram chat, and this community&apos;s
                  scraped members and conversations will be removed. Leads already generated are
                  kept. This can&apos;t be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => remove.mutate(community.id)}
                  className='bg-destructive text-white hover:bg-destructive/90'
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </TableCell>
    </TableRow>
  );
}
