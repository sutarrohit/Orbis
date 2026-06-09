"use client";

import Link from "next/link";
import { BotIcon, SettingsIcon } from "lucide-react";

import { useBrand } from "@/lib/hooks/use-brand";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardHeader() {
  const { brand, isPending } = useBrand();

  if (isPending) {
    return (
      <div className='flex items-center justify-between rounded-xl border bg-card p-6'>
        <div className='flex items-center gap-4'>
          <Skeleton className='size-12 rounded-lg' />
          <div className='space-y-2'>
            <Skeleton className='h-6 w-40' />
            <Skeleton className='h-4 w-56' />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='flex md:flex-row flex-col items-center justify-between rounded-xl border p-4 gap-4 bg-secondary'>
      <div className='flex md:flex-row flex-col items-center gap-4'>
        <div className='flex size-10 items-center justify-center rounded-lg bg-blue-500/40'>
          <BotIcon className='size-5' />
        </div>
        <div>
          <h1 className='text-xl font-semibold'>{brand?.name ?? "Orbis"}</h1>
          <p className='text-sm text-muted-foreground'>{brand?.niche ?? "AI Lead Generation Engine"}</p>
        </div>
      </div>

      <Button variant='outline' asChild>
        <Link href='/agent-config'>
          <SettingsIcon className='size-4' />
          Configure Agents
        </Link>
      </Button>
    </div>
  );
}
