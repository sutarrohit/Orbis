"use client";

import Link from "next/link";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function TelegramConnection() {
  return (
    <Card>
      <CardContent className='flex items-center gap-4 p-4'>
        <div className='flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40'>
          <Send className='size-5 text-blue-600 dark:text-blue-400' />
        </div>
        <div className='min-w-0 flex-1'>
          <p className='text-sm font-medium'>Telegram Connection</p>
          <p className='text-xs text-muted-foreground'>
            Connect your Telegram account to enable automated engagement and lead generation.
          </p>
        </div>
        <Button asChild size='sm'>
          <Link href='/accounts'>Connect Telegram</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
