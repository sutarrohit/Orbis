"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { toast } from "sonner";

import type { SchedulerConfig } from "@/lib/api/scheduler-config/scheduler-config-apis";
import {
  schedulerConfigKeys,
  schedulerConfigQueryOptions,
  updateSchedulerConfigMutationOptions
} from "@/lib/api/scheduler-config/scheduler-config-queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";

// The Leader cycle ("posting" in old copy) and the follow-up sweep intervals.
const LEADER_OPTIONS = [
  { value: "1", label: "Every 1 minute" },
  { value: "3", label: "Every 3 minutes" },
  { value: "5", label: "Every 5 minutes" },
  { value: "10", label: "Every 10 minutes" },
  { value: "15", label: "Every 15 minutes" },
  { value: "30", label: "Every 30 minutes" },
  { value: "60", label: "Every 60 minutes" }
];

const FOLLOWUP_OPTIONS = [
  { value: "5", label: "Every 5 minutes" },
  { value: "10", label: "Every 10 minutes" },
  { value: "15", label: "Every 15 minutes" },
  { value: "30", label: "Every 30 minutes" },
  { value: "60", label: "Every 60 minutes" }
];

export function SquadSchedule() {
  const queryClient = useQueryClient();
  const { data: config, isPending } = useQuery(schedulerConfigQueryOptions());

  // Local edits to the interval selects. `null` = untouched, so the displayed
  // value tracks the server until the user changes it; cleared after a save.
  const [leaderEdit, setLeaderEdit] = useState<string | null>(null);
  const [followupEdit, setFollowupEdit] = useState<string | null>(null);

  const update = useMutation({
    ...updateSchedulerConfigMutationOptions(),
    onSuccess: (next: SchedulerConfig) => {
      queryClient.setQueryData(schedulerConfigKeys.config, next);
      setLeaderEdit(null);
      setFollowupEdit(null);
    },
    onError: (e: Error) => {
      queryClient.invalidateQueries({ queryKey: schedulerConfigKeys.config });
      toast.error(e.message || "Could not update the schedule");
    }
  });

  const isOn = config?.enabled ?? false;
  const leaderValue = leaderEdit ?? (config ? String(config.leaderIntervalMinutes) : "5");
  const followupValue = followupEdit ?? (config ? String(config.followupIntervalMinutes) : "15");
  const dirty =
    config != null &&
    (Number(leaderValue) !== config.leaderIntervalMinutes ||
      Number(followupValue) !== config.followupIntervalMinutes);

  function onToggle(next: boolean) {
    update.mutate(
      { enabled: next },
      { onSuccess: () => toast.success(next ? "Autonomous mode on" : "Autonomous mode off") }
    );
  }

  function onSave() {
    update.mutate(
      {
        leaderIntervalMinutes: Number(leaderValue),
        followupIntervalMinutes: Number(followupValue)
      },
      { onSuccess: () => toast.success("Schedule saved") }
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <div className='flex size-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40'>
            <CalendarClock className='size-4 text-blue-600 dark:text-blue-400' />
          </div>
          Squad Schedule
        </CardTitle>
        <p className='text-xs text-muted-foreground'>
          Run the Leader cycle and follow-up sweep automatically on a schedule.
        </p>
      </CardHeader>

      <CardContent className='flex flex-col gap-5'>
        {/* Autonomous Mode — the live on/off (persisted in the DB) */}
        <div className='flex items-center justify-between rounded-md bg-secondary p-4'>
          <div className='flex flex-col'>
            <Label htmlFor='autonomousMode'>Autonomous Mode</Label>
            <span className='text-xs text-muted-foreground'>
              {isOn
                ? `On — Leader every ${leaderValue} min · Follow-up every ${followupValue} min`
                : "Off — agents only run when you trigger them manually."}
            </span>
          </div>
          <div className='flex items-center gap-2'>
            {update.isPending ? <Spinner className='size-4' /> : null}
            <Switch
              id='autonomousMode'
              checked={isOn}
              disabled={isPending || update.isPending}
              onCheckedChange={onToggle}
            />
          </div>
        </div>

        {/* Leader Cycle & Follow-up intervals — side by side */}
        <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='leaderInterval'>Leader Cycle Interval</Label>
            <Select value={leaderValue} onValueChange={setLeaderEdit} disabled={isPending}>
              <SelectTrigger id='leaderInterval'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEADER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='followupInterval'>Follow-up Interval</Label>
            <Select value={followupValue} onValueChange={setFollowupEdit} disabled={isPending}>
              <SelectTrigger id='followupInterval'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FOLLOWUP_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <p className='text-xs text-muted-foreground'>
          Interval changes apply within about a minute. They take effect only while Autonomous Mode is on.
        </p>

        {/* Save */}
        <div className='flex justify-end pt-2'>
          <Button type='button' onClick={onSave} disabled={!dirty || update.isPending}>
            {update.isPending ? <Spinner className='mr-1 size-4' /> : null}
            Save Schedule
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
