"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { LeadWithConversations, UpdateLeadInput } from "@/lib/api/leads/leads-apis";
import { leadKeys, updateLeadMutationOptions } from "@/lib/api/leads/leads-queries";
import type { InterestLevel, LeadStatus } from "@/lib/api/enums";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

const LEAD_STATUSES: LeadStatus[] = ["new", "prospect", "nurturing", "cold", "lost", "converted"];
const INTEREST_LEVELS: InterestLevel[] = ["hot", "warm", "cool", "skip"];

export function LeadEditor({ lead }: { lead: LeadWithConversations }) {
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
