"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { LeadWithConversations } from "@/lib/api/leads/leads-apis";
import { leadKeys } from "@/lib/api/leads/leads-queries";
import type { Account } from "@/lib/api/accounts/accounts-apis";
import { sendMessageMutationOptions } from "@/lib/api/conversations/conversation-queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

export function SendDmCard({ lead, accounts }: { lead: LeadWithConversations; accounts: Account[] }) {
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
