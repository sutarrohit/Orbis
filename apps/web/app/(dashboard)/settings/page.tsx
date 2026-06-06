"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { Brand, UpdateBrandInput } from "@/lib/api/brand/brand-apis";
import { brandKeys, getBrandQueryOptions, updateBrandMutationOptions } from "@/lib/api/brand/brand-queries";
import { ErrorState, LoadingState } from "@/components/data/data-states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

function SettingsForm({ brand }: { brand: Brand }) {
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

  const set = <K extends keyof UpdateBrandInput>(key: K, value: UpdateBrandInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const { mutate, isPending } = useMutation({
    ...updateBrandMutationOptions(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: brandKeys.all });
      toast.success("Settings saved");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not save settings");
    }
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutate({ ...form, slug: form.slug?.trim() ? form.slug.trim() : null });
  }

  return (
    <form onSubmit={onSubmit} className='flex flex-col gap-4'>
      <Card>
        <CardHeader>
          <CardTitle>Brand</CardTitle>
          <CardDescription>Core details about your workspace.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='name'>Name</Label>
            <Input id='name' value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} required />
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='niche'>Niche</Label>
            <Input id='niche' value={form.niche ?? ""} onChange={(e) => set("niche", e.target.value)} />
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='slug'>Slug</Label>
            <Input id='slug' value={form.slug ?? ""} onChange={(e) => set("slug", e.target.value)} />
          </div>
          <div className='flex items-center justify-between'>
            <div className='flex flex-col'>
              <Label htmlFor='active'>Active</Label>
              <span className='text-xs text-muted-foreground'>Whether agents run for this brand.</span>
            </div>
            <Switch id='active' checked={form.active ?? false} onCheckedChange={(v) => set("active", v)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sales profile</CardTitle>
          <CardDescription>How the agents pitch, price, and handle objections.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='persona'>Persona</Label>
            <Textarea id='persona' value={form.persona ?? ""} onChange={(e) => set("persona", e.target.value)} />
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='productSummary'>Product summary</Label>
            <Textarea
              id='productSummary'
              value={form.productSummary ?? ""}
              onChange={(e) => set("productSummary", e.target.value)}
            />
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='pricing'>Pricing</Label>
            <Input id='pricing' value={form.pricing ?? ""} onChange={(e) => set("pricing", e.target.value)} />
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='conversionAction'>Conversion action</Label>
            <Input
              id='conversionAction'
              value={form.conversionAction ?? ""}
              onChange={(e) => set("conversionAction", e.target.value)}
              placeholder='e.g. book a call, start a trial'
            />
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='objectionNotes'>Objection notes</Label>
            <Textarea
              id='objectionNotes'
              value={form.objectionNotes ?? ""}
              onChange={(e) => set("objectionNotes", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className='flex justify-end'>
        <Button type='submit' disabled={isPending || (form.name ?? "").trim().length === 0}>
          {isPending ? <Spinner /> : null}
          {isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

export default function SettingsPage() {
  const { data, isPending, isError, refetch } = useQuery(getBrandQueryOptions());

  return (
    <main className='mx-auto w-full max-w-2xl flex-1 p-4'>
      <h1 className='mb-4 text-lg font-medium'>Settings</h1>
      {isPending ? (
        <LoadingState />
      ) : isError || !data?.brand ? (
        <ErrorState title='Could not load settings' onRetry={() => refetch()} />
      ) : (
        <SettingsForm brand={data.brand} />
      )}
    </main>
  );
}
