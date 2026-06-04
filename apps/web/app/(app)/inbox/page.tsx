"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  conversationKeys,
  listConversationsQueryOptions,
  sendReplyMutationOptions,
  threadQueryOptions
} from "@/lib/api/conversations/conversation-queries";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

const inputClass = cn(
  "h-8 flex-1 rounded-md bg-input/30 px-2.5 text-xs/relaxed ring-1 ring-foreground/10",
  "outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
);

export default function InboxPage() {
  const qc = useQueryClient();
  const { data: list, isPending } = useQuery(listConversationsQueryOptions());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const thread = useQuery(threadQueryOptions(selectedId ?? ""));
  const [draft, setDraft] = useState("");

  const reply = useMutation({
    ...sendReplyMutationOptions(),
    onSuccess: () => {
      setDraft("");
      if (selectedId) qc.invalidateQueries({ queryKey: conversationKeys.thread(selectedId) });
      qc.invalidateQueries({ queryKey: conversationKeys.all });
    }
  });

  // Live updates: refetch on inbound/outbound message events for this org.
  useEffect(() => {
    const es = new EventSource(`${API_BASE}/conversations/stream`, { withCredentials: true });
    const onMessage = (e: MessageEvent) => {
      let conversationId: string | undefined;
      try {
        conversationId = JSON.parse(e.data)?.conversationId;
      } catch {
        // ignore malformed payloads
      }
      qc.invalidateQueries({ queryKey: conversationKeys.all });
      if (conversationId) qc.invalidateQueries({ queryKey: conversationKeys.thread(conversationId) });
    };
    es.addEventListener("message.created", onMessage);
    return () => {
      es.removeEventListener("message.created", onMessage);
      es.close();
    };
  }, [qc]);

  function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || !draft.trim()) return;
    reply.mutate({ id: selectedId, content: draft.trim() });
  }

  const conversations = list?.data ?? [];

  return (
    <div className="flex min-h-0 flex-1">
      {/* Conversation list */}
      <div className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-foreground/10">
        {isPending ? (
          <p className="p-3 text-xs/relaxed text-muted-foreground">Loading…</p>
        ) : !conversations.length ? (
          <p className="p-3 text-xs/relaxed text-muted-foreground">No conversations yet.</p>
        ) : (
          conversations.map((conv) => {
            const last = conv.messages[0];
            return (
              <button
                key={conv.id}
                onClick={() => setSelectedId(conv.id)}
                className={cn(
                  "flex flex-col gap-0.5 border-b border-foreground/5 px-3 py-2 text-left hover:bg-muted",
                  selectedId === conv.id && "bg-muted"
                )}
              >
                <span className="truncate text-xs/relaxed font-medium">
                  {conv.customer.displayName ?? "Unknown"}
                </span>
                <span className="truncate text-[0.625rem] text-muted-foreground">
                  {last?.content ?? `${conv.channel} · ${conv.status}`}
                </span>
              </button>
            );
          })
        )}
      </div>

      {/* Thread + composer */}
      <div className="flex min-h-0 flex-1 flex-col">
        {!selectedId ? (
          <div className="flex flex-1 items-center justify-center text-xs/relaxed text-muted-foreground">
            Select a conversation
          </div>
        ) : (
          <>
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
              {thread.data?.map((m) => {
                const outbound = m.direction === "OUTBOUND";
                return (
                  <div
                    key={m.id}
                    className={cn("flex flex-col", outbound ? "items-end" : "items-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[75%] rounded-lg px-3 py-1.5 text-xs/relaxed",
                        outbound
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      )}
                    >
                      {m.content}
                    </div>
                    <span className="px-1 pt-0.5 text-[0.5625rem] text-muted-foreground">
                      {outbound ? m.status : ""}
                    </span>
                  </div>
                );
              })}
            </div>

            <form onSubmit={onSend} className="flex gap-2 border-t border-foreground/10 p-3">
              <input
                className={inputClass}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type a reply…"
                autoComplete="off"
              />
              <Button type="submit" disabled={reply.isPending || !draft.trim()}>
                {reply.isPending ? "Sending…" : "Send"}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
