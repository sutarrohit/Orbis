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
  const [platform, setPlatform] = useState<"telegram" | "discord">("telegram");
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setPlatform("telegram");
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
      platform,
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
          <DialogDescription>
            Manually add a Telegram group or Discord server for the agents to evaluate.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className='flex flex-col gap-4'>
          <div className='flex flex-col gap-2'>
            <Label>Platform</Label>
            <div className='flex gap-2'>
              <Button
                type='button'
                variant={platform === "telegram" ? "default" : "outline"}
                className='flex-1'
                onClick={() => setPlatform("telegram")}
              >
                Telegram
              </Button>
              <Button
                type='button'
                variant={platform === "discord" ? "default" : "outline"}
                className='flex-1'
                onClick={() => setPlatform("discord")}
              >
                Discord
              </Button>
            </div>
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='handle'>{platform === "discord" ? "Invite link" : "Handle or invite link"}</Label>
            <Input
              id='handle'
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder='@groupname or https://discord.gg/…'
              autoFocus
              required
            />
            <p className='text-muted-foreground text-xs'>
              A Telegram @handle / t.me link, or a Discord invite link. The platform follows the
              account you assign it to.
            </p>
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
