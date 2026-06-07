"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RateLimits() {
  const [maxGroups, setMaxGroups] = useState(10);
  const [maxDMs, setMaxDMs] = useState(15);
  const [maxReplies, setMaxReplies] = useState(30);

  function onSave() {
    toast.info("Rate limits API not yet available");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <div className='flex size-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40'>
            <ShieldCheck className='size-4 text-blue-600 dark:text-blue-400' />
          </div>
          Rate Limits
        </CardTitle>
        <p className='text-xs text-muted-foreground'>
          Prevent account bans by limiting agent activity. These are daily limits per account.
        </p>
      </CardHeader>

      <CardContent className='flex flex-col gap-5'>
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-3'>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='maxGroups'>Max Groups per Account</Label>
            <Input
              id='maxGroups'
              type='number'
              min={1}
              value={maxGroups}
              onChange={(e) => setMaxGroups(Number(e.target.value))}
            />
            <span className='text-xs text-muted-foreground'>
              Max groups the Search Agent will join per account. Default: 10
            </span>
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='maxDMs'>Max DMs per Day</Label>
            <Input
              id='maxDMs'
              type='number'
              min={1}
              value={maxDMs}
              onChange={(e) => setMaxDMs(Number(e.target.value))}
            />
            <span className='text-xs text-muted-foreground'>Sales Agent DM limit per account per day. Default: 15</span>
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='maxReplies'>Max Group Replies per Day</Label>
            <Input
              id='maxReplies'
              type='number'
              min={1}
              value={maxReplies}
              onChange={(e) => setMaxReplies(Number(e.target.value))}
            />
            <span className='text-xs text-muted-foreground'>
              Talk Agent reply limit per account per day. Default: 30
            </span>
          </div>
        </div>

        <div className='flex justify-end pt-2'>
          <Button type='button' onClick={onSave}>
            Save Rate Limits
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
