"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { AuthGate } from "@/components/auth/auth-gate";
import { brandKeys, createBrandMutationOptions } from "@/lib/api/brand/brand-queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

function OnboardingForm() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [niche, setNiche] = useState("");
  const [slug, setSlug] = useState("");

  const { mutate, isPending } = useMutation({
    ...createBrandMutationOptions(),
    onSuccess: (brand) => {
      // Seed the cache so BrandGate sees the new brand immediately on "/" and
      // doesn't bounce back here while a refetch is still in flight.
      queryClient.setQueryData(brandKeys.all, { brand });
      toast.success("Brand created");
      router.replace("/");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not create brand");
    }
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutate({ name: name.trim(), niche: niche.trim() || undefined, slug: slug.trim() || undefined });
  }

  return (
    <Card className='w-full max-w-sm'>
      <CardHeader>
        <CardTitle>Create your brand</CardTitle>
        <CardDescription>Set up your workspace so the agents know who they represent.</CardDescription>
      </CardHeader>

      <form onSubmit={onSubmit}>
        <CardContent className='flex flex-col gap-4'>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='name'>Brand name</Label>
            <Input id='name' value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>

          <div className='flex flex-col gap-2'>
            <Label htmlFor='niche'>Niche</Label>
            <Input
              id='niche'
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder='e.g. crypto trading, SaaS, fitness'
            />
          </div>

          <div className='flex flex-col gap-2'>
            <Label htmlFor='slug'>Slug</Label>
            <Input
              id='slug'
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder='optional-url-handle'
            />
          </div>
        </CardContent>

        <CardFooter>
          <Button type='submit' className='w-full' disabled={isPending || name.trim().length === 0}>
            {isPending ? <Spinner /> : null}
            {isPending ? "Creating…" : "Create brand"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function OnboardingPage() {
  return (
    <AuthGate>
      <div className='flex flex-1 items-center justify-center p-6'>
        <OnboardingForm />
      </div>
    </AuthGate>
  );
}
