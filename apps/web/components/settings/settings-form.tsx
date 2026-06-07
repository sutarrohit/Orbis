"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import type { Brand, UpdateBrandInput } from "@/lib/api/brand/brand-apis";
import { brandKeys, updateBrandMutationOptions } from "@/lib/api/brand/brand-queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function joinTags(tags: string[]): string {
  return tags.join(", ");
}

export function SettingsForm({ brand }: { brand: Brand }) {
  const queryClient = useQueryClient();
  const profile = brand.profile;

  const [form, setForm] = useState<UpdateBrandInput>({
    name: brand.name,
    niche: brand.niche,
    slug: brand.slug ?? "",
    active: brand.active,
    persona: profile?.persona ?? "",
    productSummary: profile?.productSummary ?? "",
    pricing: profile?.pricing ?? "",
    conversionAction: profile?.conversionAction ?? "",
    objectionNotes: profile?.objectionNotes ?? ""
  });

  const [voiceTags, setVoiceTags] = useState<string[]>(() => parseTags(profile?.pricing ?? ""));
  const [contentTopics, setContentTopics] = useState<string[]>(() => parseTags(profile?.objectionNotes ?? ""));
  const [voiceTagInput, setVoiceTagInput] = useState("");
  const [topicInput, setTopicInput] = useState("");
  const [showVoiceInput, setShowVoiceInput] = useState(false);
  const [showTopicInput, setShowTopicInput] = useState(false);

  const set = <K extends keyof UpdateBrandInput>(key: K, value: UpdateBrandInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const { mutate, isPending } = useMutation({
    ...updateBrandMutationOptions(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: brandKeys.all });
      toast.success("Brand changes saved");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not save settings");
    }
  });

  function addVoiceTag() {
    const tag = voiceTagInput.trim();
    if (tag && !voiceTags.includes(tag)) {
      setVoiceTags((prev) => [...prev, tag]);
    }
    setVoiceTagInput("");
    setShowVoiceInput(false);
  }

  function removeVoiceTag(tag: string) {
    setVoiceTags((prev) => prev.filter((t) => t !== tag));
  }

  function addContentTopic() {
    const topic = topicInput.trim();
    if (topic && !contentTopics.includes(topic)) {
      setContentTopics((prev) => [...prev, topic]);
    }
    setTopicInput("");
    setShowTopicInput(false);
  }

  function removeContentTopic(topic: string) {
    setContentTopics((prev) => prev.filter((t) => t !== topic));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutate({
      ...form,
      slug: form.slug?.trim() ? form.slug.trim() : null,
      pricing: joinTags(voiceTags),
      objectionNotes: joinTags(contentTopics)
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <div className='flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground'>
              <Sparkles className='size-4' />
            </div>
            Brand Persona
          </CardTitle>
        </CardHeader>

        <CardContent className='flex flex-col gap-5'>
          {/* Brand Name & Niche — side by side */}
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
            <div className='flex flex-col gap-2'>
              <Label htmlFor='name'>Brand Name</Label>
              <Input id='name' value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} required />
            </div>
            <div className='flex flex-col gap-2'>
              <Label htmlFor='niche'>Niche</Label>
              <Input id='niche' value={form.niche ?? ""} onChange={(e) => set("niche", e.target.value)} />
            </div>
          </div>

          {/* Short Description */}
          <div className='flex flex-col gap-2'>
            <Label htmlFor='productSummary'>Short Description</Label>
            <Textarea
              id='productSummary'
              value={form.productSummary ?? ""}
              onChange={(e) => set("productSummary", e.target.value)}
              rows={3}
            />
          </div>

          {/* Voice Tags */}
          <div className='flex flex-col gap-2'>
            <Label>Voice Tags</Label>
            <div className='flex flex-wrap items-center gap-2'>
              {voiceTags.map((tag) => (
                <Badge key={tag} variant='secondary' className='gap-1 pl-2.5 pr-1.5 text-xs'>
                  {tag}
                  <button
                    type='button'
                    onClick={() => removeVoiceTag(tag)}
                    className='ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20'
                  >
                    <X className='size-3' />
                  </button>
                </Badge>
              ))}
              {showVoiceInput ? (
                <Input
                  autoFocus
                  value={voiceTagInput}
                  onChange={(e) => setVoiceTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addVoiceTag();
                    }
                    if (e.key === "Escape") {
                      setShowVoiceInput(false);
                      setVoiceTagInput("");
                    }
                  }}
                  onBlur={addVoiceTag}
                  placeholder='Tag name'
                  className='h-7 w-28'
                />
              ) : (
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  className='h-7 gap-1 text-xs'
                  onClick={() => setShowVoiceInput(true)}
                >
                  <Plus className='size-3' />
                  Add Voice
                </Button>
              )}
            </div>
          </div>

          {/* Voice Description & Target Audience — side by side */}
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
            <div className='flex flex-col gap-2'>
              <Label htmlFor='persona'>Voice Description</Label>
              <Textarea
                id='persona'
                value={form.persona ?? ""}
                onChange={(e) => set("persona", e.target.value)}
                rows={3}
              />
            </div>
            <div className='flex flex-col gap-2'>
              <Label htmlFor='conversionAction'>Target Audience</Label>
              <Textarea
                id='conversionAction'
                value={form.conversionAction ?? ""}
                onChange={(e) => set("conversionAction", e.target.value)}
                rows={3}
              />
            </div>
          </div>

          {/* Content Topics */}
          <div className='flex flex-col gap-2'>
            <Label>Content Topics</Label>
            <div className='flex flex-wrap items-center gap-2'>
              {contentTopics.map((topic) => (
                <Badge key={topic} variant='outline' className='gap-1 pl-2.5 pr-1.5 text-[0.65rem] uppercase'>
                  {topic}
                  <button
                    type='button'
                    onClick={() => removeContentTopic(topic)}
                    className='ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20'
                  >
                    <X className='size-3' />
                  </button>
                </Badge>
              ))}
              {showTopicInput ? (
                <Input
                  autoFocus
                  value={topicInput}
                  onChange={(e) => setTopicInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addContentTopic();
                    }
                    if (e.key === "Escape") {
                      setShowTopicInput(false);
                      setTopicInput("");
                    }
                  }}
                  onBlur={addContentTopic}
                  placeholder='Topic name'
                  className='h-7 w-32'
                />
              ) : (
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  className='h-7 gap-1 text-xs'
                  onClick={() => setShowTopicInput(true)}
                >
                  <Plus className='size-3' />
                  Add Topic
                </Button>
              )}
            </div>
          </div>

          {/* Submit */}
          <div className='flex justify-end pt-2'>
            <Button type='submit' disabled={isPending || (form.name ?? "").trim().length === 0}>
              {isPending ? <Spinner /> : null}
              {isPending ? "Saving…" : "Save Brand Changes"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
