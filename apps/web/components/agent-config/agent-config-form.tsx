"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";

import type { AgentConfig } from "@/lib/api/agent-config/agent-config-apis";
import { AGENT_DEFAULTS } from "@/lib/api/agent-config/agent-defaults";
import {
  agentConfigKeys,
  upsertAgentConfigMutationOptions,
} from "@/lib/api/agent-config/agent-config-queries";
import type { AgentType } from "@/lib/api/enums";
import { ChipListEditor } from "@/components/agent-config/chip-list-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
// import { Switch } from "@/components/ui/switch"; // re-enable with the Agent Enabled toggle
import { Textarea } from "@/components/ui/textarea";

const RESPONSE_STYLES = [
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "friendly", label: "Friendly" },
  { value: "authoritative", label: "Authoritative" },
  { value: "empathetic", label: "Empathetic" },
  { value: "concise", label: "Concise" },
];

const AGENT_LABELS: Record<AgentType, string> = {
  leader: "Leader",
  search: "Search",
  talk: "Talk",
  research: "Research",
  sales: "Sales",
};

type FormState = {
  enabled: boolean;
  personaName: string;
  responseStyle: string;
  personaDescription: string;
  voiceTags: string[];
  voiceDescription: string;
  behaviorRules: string[];
  bannedTopics: string[];
  systemPrompt: string;
  knowledgeBase: string;
  maxResponseLength: number;
  searchQueries: string[];
};

export function AgentConfigForm({
  agentType,
  config,
}: {
  agentType: AgentType;
  config?: AgentConfig;
}) {
  const queryClient = useQueryClient();
  // Generic per-role defaults fill persona/style/system-prompt when the brand
  // has not set them, so the form shows what the agent will do by default
  // (matches the agents' runtime fallback). A saved value always wins.
  const defaults = AGENT_DEFAULTS[agentType];
  const [form, setForm] = useState<FormState>({
    enabled: config?.enabled ?? true,
    personaName: config?.personaName || defaults.personaName,
    responseStyle: config?.responseStyle || defaults.responseStyle,
    personaDescription: config?.personaDescription ?? "",
    voiceTags: config?.voiceTags ?? [],
    voiceDescription: config?.voiceDescription ?? "",
    behaviorRules: config?.behaviorRules ?? [],
    bannedTopics: config?.bannedTopics ?? [],
    systemPrompt: config?.systemPrompt || defaults.systemPrompt,
    knowledgeBase: config?.knowledgeBase ?? "",
    maxResponseLength: config?.maxResponseLength ?? 0,
    searchQueries: config?.searchQueries ?? [],
  });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const { mutate, isPending } = useMutation({
    ...upsertAgentConfigMutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentConfigKeys.all });
      toast.success("Configuration saved");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Could not save configuration",
      ),
  });

  return (
    <div className="flex flex-col gap-8">
      {/* PERSONA & IDENTITY */}
      <section className="flex flex-col gap-4">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Persona & Identity
          </h3>
          <Separator className="mt-2" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${agentType}-persona-name`}>Persona Name</Label>
            <Input
              id={`${agentType}-persona-name`}
              value={form.personaName}
              onChange={(e) => set("personaName", e.target.value)}
              placeholder="e.g. Alex"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${agentType}-response-style`}>
              Response Style
            </Label>
            <Select
              value={form.responseStyle}
              onValueChange={(v) => set("responseStyle", v)}
            >
              <SelectTrigger
                id={`${agentType}-response-style`}
                className="w-full"
              >
                <SelectValue placeholder="Select a style" />
              </SelectTrigger>
              <SelectContent>
                {RESPONSE_STYLES.map((style) => (
                  <SelectItem key={style.value} value={style.value}>
                    {style.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {agentType === "search" ? (
          <div className="flex flex-col gap-2">
            <Label>Search Queries</Label>
            <ChipListEditor
              values={form.searchQueries}
              onChange={(v) => set("searchQueries", v)}
              placeholder="e.g. best crypto trading Telegram groups"
              addLabel={
                <>
                  <PlusIcon className="size-3" /> Add Query
                </>
              }
            />
            <span className="text-xs text-muted-foreground">
              Web-search queries the Search agent runs. Leave empty to derive one
              from the brand&apos;s niche.
            </span>
          </div>
        ) : null}

        {/* Persona Description — hidden for the Search and Leader agents */}
        {agentType !== "search" && agentType !== "leader" ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${agentType}-persona-desc`}>
              Persona Description
            </Label>
            <Textarea
              id={`${agentType}-persona-desc`}
              value={form.personaDescription}
              onChange={(e) => set("personaDescription", e.target.value)}
              rows={3}
              placeholder="Describe this agent's persona and personality..."
            />
          </div>
        ) : null}
      </section>

      {/* VOICE & TONE — hidden from UI; code kept for future use
      <section className="flex flex-col gap-4">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Voice & Tone
          </h3>
          <Separator className="mt-2" />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Voice Tags</Label>
          <ChipListEditor
            values={form.voiceTags}
            onChange={(v) => set("voiceTags", v)}
            placeholder="e.g. friendly"
            addLabel={
              <>
                <PlusIcon className="size-3" /> Add Tag
              </>
            }
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${agentType}-voice-desc`}>Voice Description</Label>
          <Textarea
            id={`${agentType}-voice-desc`}
            value={form.voiceDescription}
            onChange={(e) => set("voiceDescription", e.target.value)}
            rows={3}
            placeholder="Describe the voice and tone this agent should use..."
          />
        </div>
      </section>
      */}

      {/* SYSTEM PROMPT (ADVANCED) */}
      <section className="flex flex-col gap-4">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            System Prompt (Advanced)
          </h3>
          <Separator className="mt-2" />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${agentType}-system-prompt`}>
            Custom System Prompt Override
          </Label>
          <Textarea
            id={`${agentType}-system-prompt`}
            value={form.systemPrompt}
            onChange={(e) => set("systemPrompt", e.target.value)}
            rows={6}
            placeholder="Enter a custom system prompt to override the default..."
            className="font-mono text-sm"
          />
        </div>
      </section>

      {/* BEHAVIOR & RULES — hidden from UI; code kept for future use
      <section className="flex flex-col gap-4">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Behavior & Rules
          </h3>
          <Separator className="mt-2" />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Behavior Rules</Label>
          <ChipListEditor
            values={form.behaviorRules}
            onChange={(v) => set("behaviorRules", v)}
            placeholder="e.g. never spam links"
            addLabel={
              <>
                <PlusIcon className="size-3" /> Add Rule
              </>
            }
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Banned Topics</Label>
          <ChipListEditor
            values={form.bannedTopics}
            onChange={(v) => set("bannedTopics", v)}
            placeholder="e.g. politics"
            addLabel={
              <>
                <PlusIcon className="size-3" /> Add Topic
              </>
            }
          />
        </div>
      </section>
      */}

      {/* KNOWLEDGE BASE — hidden for the Search agent */}
      {agentType !== "search" ? (
        <section className="flex flex-col gap-4">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Knowledge Base
            </h3>
            <Separator className="mt-2" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${agentType}-knowledge-base`}>
              Product Info, FAQs, Brand Guidelines
            </Label>
            <Textarea
              id={`${agentType}-knowledge-base`}
              value={form.knowledgeBase}
              onChange={(e) => set("knowledgeBase", e.target.value)}
              rows={6}
              placeholder="Enter product information, frequently asked questions, brand guidelines..."
            />
          </div>
        </section>
      ) : null}

      {/* FINE-TUNING — hidden for the Leader agent */}
      {agentType !== "leader" ? (
        <section className="flex flex-col gap-4">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Fine-Tuning
            </h3>
            <Separator className="mt-2" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${agentType}-max-length`}>
                Max Response Length (words)
              </Label>
              <Input
                id={`${agentType}-max-length`}
                type="number"
                min={0}
                value={form.maxResponseLength || ""}
                onChange={(e) =>
                  set(
                    "maxResponseLength",
                    e.target.value ? Number(e.target.value) : 0,
                  )
                }
                placeholder="0 = no limit"
              />
            </div>

            {/* Agent Enabled — hidden from UI; code kept for future use
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex flex-col">
                <Label htmlFor={`${agentType}-enabled`}>Agent Enabled</Label>
                <span className="text-xs text-muted-foreground">
                  Turn this agent on or off
                </span>
              </div>
              <Switch
                id={`${agentType}-enabled`}
                checked={form.enabled}
                onCheckedChange={(v) => set("enabled", v)}
              />
            </div>
            */}
          </div>
        </section>
      ) : null}

      {/* Save button */}
      <div className="flex justify-end">
        <Button
          onClick={() => mutate({ agentType, ...form })}
          disabled={isPending}
          size="lg"
        >
          {isPending ? <Spinner className="mr-1" /> : null}
          Save {AGENT_LABELS[agentType]} Agent Config
        </Button>
      </div>
    </div>
  );
}
