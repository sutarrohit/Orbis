"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessagesSquare } from "lucide-react";

import { listConversationsQueryOptions } from "@/lib/api/conversations/conversation-queries";
import { listCommunitiesQueryOptions } from "@/lib/api/communities/communities-queries";
import { EmptyState, ErrorState, LoadingState } from "@/components/data/data-states";
import { formatRelativeTime } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "all";

export default function ConversationsPage() {
  const [groupChatId, setGroupChatId] = useState<string>(ALL);
  const [search, setSearch] = useState("");

  const params = groupChatId === ALL ? {} : { communityId: groupChatId };
  const { data, isPending, isError, refetch } = useQuery(listConversationsQueryOptions(params));
  const { data: communities } = useQuery(listCommunitiesQueryOptions());

  // Map groupChatId -> community name for nicer labels, and the filter options.
  const namesByChat = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of communities ?? []) {
      if (c.groupChatId) map.set(c.groupChatId, c.name || c.handle);
    }
    return map;
  }, [communities]);

  const communityOptions = useMemo(
    () => (communities ?? []).filter((c) => c.groupChatId),
    [communities]
  );

  const messages = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return data ?? [];
    return (data ?? []).filter((m) => m.username.toLowerCase().includes(term));
  }, [data, search]);

  return (
    <main className='flex flex-1 flex-col gap-4 p-4'>
      <h1 className='text-lg font-medium'>Conversations</h1>

      <div className='flex flex-wrap items-center gap-2'>
        <Select value={groupChatId} onValueChange={setGroupChatId}>
          <SelectTrigger className='w-56'>
            <SelectValue placeholder='All communities' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All communities</SelectItem>
            {communityOptions.map((c) => (
              <SelectItem key={c.id} value={c.groupChatId}>
                {c.name || c.handle}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder='Search by username…'
          className='w-56'
        />
      </div>

      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState title='Could not load conversations' onRetry={() => refetch()} />
      ) : messages.length === 0 ? (
        <EmptyState
          icon={<MessagesSquare />}
          title='No messages'
          description='Captured group messages will show up here as the agents listen in.'
        />
      ) : (
        <div className='flex flex-col divide-y rounded-xl border'>
          {messages.map((m) => (
            <div key={m.id} className='flex flex-col gap-1 p-3'>
              <div className='flex items-center justify-between text-xs text-muted-foreground'>
                <span className='font-medium text-foreground'>{m.username}</span>
                <span>{formatRelativeTime(m.ts)}</span>
              </div>
              <p className='text-sm'>{m.text}</p>
              <span className='text-xs text-muted-foreground'>
                {namesByChat.get(m.groupChatId) ?? m.groupChatId}
              </span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
