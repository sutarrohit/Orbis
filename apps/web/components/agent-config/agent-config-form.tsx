"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { AgentConfig } from "@/lib/api/agent-config/agent-config-apis";
import { agentConfigKeys, upsertAgentConfigMutationOptions } from "@/lib/api/agent-config/agent-config-queries";
import type { AgentType } from "@/lib/api/enums";
import { ChipListEditor } from "@/components/agent-config/chip-list-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type FormState = {
  enabled: boolean;
  voiceTags: string[];
  behaviorRules: string[];
  bannedTopics: string[];
  systemPrompt: string;
};

export function AgentConfigForm({ agentType, config }: { agentType: AgentType; config?: AgentConfig }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>({
    enabled: config?.enabled ?? true,
    voiceTags: config?.voiceTags ?? [],
    behaviorRules: config?.behaviorRules ?? [],
    bannedTopics: config?.bannedTopics ?? [],
    systemPrompt: config?.systemPrompt ?? ""
  });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const { mutate, isPending } = useMutation({
    ...upsertAgentConfigMutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentConfigKeys.all });
      toast.success("Configuration saved");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save configuration")
  });

  return (
    <Card>
      <CardContent className='flex flex-col gap-5'>
        <div className='flex items-center justify-between'>
          <div className='flex flex-col'>
            <Label htmlFor={`${agentType}-enabled`}>Enabled</Label>
            <span className='text-xs text-muted-foreground'>Turn this agent on or off for the brand.</span>
          </div>
          <Switch id={`${agentType}-enabled`} checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} />
        </div>

        <div className='flex flex-col gap-2'>
          <Label>Voice tags</Label>
          <ChipListEditor values={form.voiceTags} onChange={(v) => set("voiceTags", v)} placeholder='e.g. friendly' />
        </div>

        <div className='flex flex-col gap-2'>
          <Label>Behavior rules</Label>
          <ChipListEditor
            values={form.behaviorRules}
            onChange={(v) => set("behaviorRules", v)}
            placeholder='e.g. never spam links'
          />
        </div>

        <div className='flex flex-col gap-2'>
          <Label>Banned topics</Label>
          <ChipListEditor values={form.bannedTopics} onChange={(v) => set("bannedTopics", v)} placeholder='e.g. politics' />
        </div>

        <div className='flex flex-col gap-2'>
          <Label htmlFor={`${agentType}-prompt`}>System prompt</Label>
          <Textarea
            id={`${agentType}-prompt`}
            value={form.systemPrompt}
            onChange={(e) => set("systemPrompt", e.target.value)}
            rows={6}
          />
        </div>

        <div className='flex justify-end'>
          <Button onClick={() => mutate({ agentType, ...form })} disabled={isPending}>
            {isPending ? <Spinner /> : null}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
