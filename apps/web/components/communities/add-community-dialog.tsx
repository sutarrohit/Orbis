"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { communityKeys, createCommunityMutationOptions } from "@/lib/api/communities/communities-queries";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

export function AddCommunityDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setHandle("");
      setName("");
      setSourceUrl("");
    }
  }

  const { mutate, isPending } = useMutation({
    ...createCommunityMutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: communityKeys.all });
      toast.success("Community added");
      onOpenChange(false);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not add community")
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutate({
      handle: handle.trim(),
      name: name.trim() || undefined,
      sourceUrl: sourceUrl.trim() || undefined
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Add community
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a community</DialogTitle>
          <DialogDescription>Manually add a group for the agents to evaluate.</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className='flex flex-col gap-4'>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='handle'>Handle</Label>
            <Input
              id='handle'
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder='@groupname'
              autoFocus
              required
            />
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='name'>Name</Label>
            <Input id='name' value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='sourceUrl'>Source URL</Label>
            <Input id='sourceUrl' value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder='https://…' />
          </div>

          <DialogFooter>
            <Button type='submit' disabled={isPending || handle.trim().length === 0}>
              {isPending ? <Spinner /> : null}
              Add community
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
