"use client";

import type { LeadWithConversations } from "@/lib/api/leads/leads-apis";
import { formatRelativeTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

export function TranscriptCard({ lead }: { lead: LeadWithConversations }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent messages</CardTitle>
      </CardHeader>
      <CardContent>
        {lead.conversations.length === 0 ? (
          <p className='text-sm text-muted-foreground'>No messages captured yet.</p>
        ) : (
          <ScrollArea className='h-72 pr-3'>
            <div className='flex flex-col gap-3'>
              {lead.conversations.map((c) => (
                <div key={c.id} className='flex flex-col gap-0.5'>
                  <div className='flex items-center justify-between text-xs text-muted-foreground'>
                    <span>{c.username}</span>
                    <span>{formatRelativeTime(c.ts)}</span>
                  </div>
                  <p className='text-sm'>{c.text}</p>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
