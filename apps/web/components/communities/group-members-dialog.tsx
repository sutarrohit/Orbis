"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";

import type { Community } from "@/lib/api/communities/communities-apis";
import { listGroupMembersQueryOptions } from "@/lib/api/group-members/group-members-queries";
import { EmptyState, ErrorState, LoadingState } from "@/components/data/data-states";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

function GroupMembersList({ chatId }: { chatId: string }) {
  const { data, isPending, isError, refetch } = useQuery(listGroupMembersQueryOptions({ chatId }));

  if (isPending) return <LoadingState />;
  if (isError) return <ErrorState title='Could not load members' onRetry={() => refetch()} />;
  if (!data || data.data.length === 0) {
    return <EmptyState icon={<Users />} title='No members scraped yet' />;
  }

  return (
    <ScrollArea className='h-80 pr-3'>
      <div className='flex flex-col divide-y'>
        {data.data.map((m) => (
          <div key={m.id} className='flex flex-col gap-0.5 py-2'>
            <span className='text-sm font-medium'>{m.username}</span>
            {m.bio ? <span className='text-xs text-muted-foreground'>{m.bio}</span> : null}
            {m.activityNote ? <span className='text-xs text-muted-foreground'>{m.activityNote}</span> : null}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

export function GroupMembersDialog({ community }: { community: Community }) {
  const [open, setOpen] = useState(false);
  const disabled = !community.groupChatId;

  // A channel's members are stored under its linked discussion group's id, so
  // query both (the API filters by any of the comma-separated ids).
  const chatIds = [community.groupChatId, community.discussionChatId]
    .filter((id) => id && id !== "none")
    .join(",");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant='outline' size='sm' disabled={disabled}>
          Members
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Members · {community.name || community.handle}</DialogTitle>
          <DialogDescription>Scraped members of this group.</DialogDescription>
        </DialogHeader>
        {/* Rendered only while open, so the query runs on demand. */}
        <GroupMembersList chatId={chatIds} />
      </DialogContent>
    </Dialog>
  );
}
