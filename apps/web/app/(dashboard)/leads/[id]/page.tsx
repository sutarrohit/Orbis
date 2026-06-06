"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

import type { LeadWithConversations, UpdateLeadInput } from "@/lib/api/leads/leads-apis";
import { leadKeys, leadQueryOptions, updateLeadMutationOptions } from "@/lib/api/leads/leads-queries";
import type { Account } from "@/lib/api/accounts/accounts-apis";
import { listAccountsQueryOptions } from "@/lib/api/accounts/accounts-queries";
import { sendMessageMutationOptions } from "@/lib/api/conversations/conversation-queries";
import type { InterestLevel, LeadStatus } from "@/lib/api/enums";
import { ErrorState, LoadingState } from "@/components/data/data-states";
import { StatusBadge } from "@/components/data/status-badge";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

const LEAD_STATUSES: LeadStatus[] = ["new", "prospect", "nurturing", "cold", "lost", "converted"];
const INTEREST_LEVELS: InterestLevel[] = ["hot", "warm", "cool", "skip"];

function LeadEditor({ lead }: { lead: LeadWithConversations }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<UpdateLeadInput>({
    status: lead.status,
    interestLevel: lead.interestLevel,
    score: lead.score,
    outreachStage: lead.outreachStage,
    note: lead.note,
    recommendedApproach: lead.recommendedApproach
  });

  const set = <K extends keyof UpdateLeadInput>(key: K, value: UpdateLeadInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const { mutate, isPending } = useMutation({
    ...updateLeadMutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leadKeys.all });
      toast.success("Lead saved");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save lead")
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='flex flex-col gap-2'>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v as LeadStatus)}>
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAD_STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className='capitalize'>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='flex flex-col gap-2'>
            <Label>Interest</Label>
            <Select value={form.interestLevel} onValueChange={(v) => set("interestLevel", v as InterestLevel)}>
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTEREST_LEVELS.map((s) => (
                  <SelectItem key={s} value={s} className='capitalize'>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='score'>Score</Label>
            <Input
              id='score'
              type='number'
              min={0}
              max={100}
              value={form.score ?? 0}
              onChange={(e) => set("score", Number(e.target.value))}
            />
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='outreachStage'>Outreach stage</Label>
            <Input
              id='outreachStage'
              type='number'
              min={0}
              value={form.outreachStage ?? 0}
              onChange={(e) => set("outreachStage", Number(e.target.value))}
            />
          </div>
        </div>

        <div className='flex flex-col gap-2'>
          <Label htmlFor='note'>Note</Label>
          <Textarea id='note' value={form.note ?? ""} onChange={(e) => set("note", e.target.value)} />
        </div>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='approach'>Recommended approach</Label>
          <Textarea
            id='approach'
            value={form.recommendedApproach ?? ""}
            onChange={(e) => set("recommendedApproach", e.target.value)}
          />
        </div>

        <div className='flex justify-end'>
          <Button onClick={() => mutate({ id: lead.id, input: form })} disabled={isPending}>
            {isPending ? <Spinner /> : null}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SendDmCard({ lead, accounts }: { lead: LeadWithConversations; accounts: Account[] }) {
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState<string>("");
  const [message, setMessage] = useState("");

  const { mutate, isPending } = useMutation({
    ...sendMessageMutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leadKeys.detail(lead.id) });
      toast.success("Message queued");
      setMessage("");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not send message")
  });

  const canSend = accountId.length > 0 && message.trim().length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Send DM</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        <div className='flex flex-col gap-2'>
          <Label>From account</Label>
          <Select value={accountId} onValueChange={setAccountId} disabled={accounts.length === 0}>
            <SelectTrigger className='w-full'>
              <SelectValue placeholder={accounts.length === 0 ? "No accounts connected" : "Select an account"} />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.handle}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder='Write a message…'
          rows={4}
        />
        <div className='flex justify-end'>
          <Button
            onClick={() => mutate({ leadId: lead.id, accountId, message: message.trim() })}
            disabled={!canSend || isPending}
          >
            {isPending ? <Spinner /> : null}
            Send
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TranscriptCard({ lead }: { lead: LeadWithConversations }) {
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
