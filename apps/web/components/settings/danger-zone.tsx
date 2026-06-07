"use client";

import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export function DangerZone() {
  function onDeleteData() {
    toast.info("Delete all data API not yet available");
  }

  function onDeleteWorkspace() {
    toast.info("Delete workspace API not yet available");
  }

  return (
    <Card className='border-destructive/40'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <div className='flex size-8 items-center justify-center rounded-full bg-destructive/10'>
            <TriangleAlert className='size-4 text-destructive' />
          </div>
          Danger Zone
        </CardTitle>
        <p className='text-xs text-muted-foreground'>
          Irreversible actions that affect your entire workspace.
        </p>
      </CardHeader>

      <CardContent className='flex flex-col gap-4'>
        <div className='flex items-center justify-between gap-4'>
          <div className='min-w-0'>
            <p className='text-sm font-medium'>Delete all Data</p>
            <p className='text-xs text-muted-foreground'>
              Permanently remove all leads, learnings, and activity logs. Brand settings will be preserved.
            </p>
          </div>
          <Button type='button' variant='destructive' size='sm' className='shrink-0' onClick={onDeleteData}>
            Delete All Data
          </Button>
        </div>

        <Separator />

        <div className='flex items-center justify-between gap-4'>
          <div className='min-w-0'>
            <p className='text-sm font-medium'>Delete Workspace</p>
            <p className='text-xs text-muted-foreground'>
              Permanently delete your workspace and all associated data. This cannot be undone.
            </p>
          </div>
          <Button type='button' variant='destructive' size='sm' className='shrink-0' onClick={onDeleteWorkspace}>
            Delete Workspace
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
