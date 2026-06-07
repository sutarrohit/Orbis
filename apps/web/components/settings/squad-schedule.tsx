"use client";

import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const POSTING_OPTIONS = [
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
  const [postingFrequency, setPostingFrequency] = useState("5");
  const [followUpInterval, setFollowUpInterval] = useState("15");
  const [learningMode, setLearningMode] = useState(false);
  const [autoCreate, setAutoCreate] = useState(false);

  function onSave() {
    toast.info("Schedule configuration API not yet available");
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
        <p className='text-xs text-muted-foreground'>Configure your automated posting schedule and frequency.</p>
      </CardHeader>

      <CardContent className='flex flex-col gap-5'>
        {/* Posting Frequency & Follow-up Interval — side by side */}
        <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='postingFrequency'>Posting Frequency</Label>
            <Select value={postingFrequency} onValueChange={setPostingFrequency}>
              <SelectTrigger id='postingFrequency'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POSTING_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='followUpInterval'>Follow-up Interval</Label>
            <Select value={followUpInterval} onValueChange={setFollowUpInterval}>
              <SelectTrigger id='followUpInterval'>
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

        {/* Learning Mode */}
        <div className='flex items-center justify-between  bg-secondary p-4 rounded-md'>
          <div className='flex flex-col '>
            <Label htmlFor='learningMode'>Learning Mode</Label>
            <span className='text-xs text-muted-foreground'>
              Agent observes before engaging to learn community norms.
            </span>
          </div>
          <Switch id='learningMode' checked={learningMode} onCheckedChange={setLearningMode} />
        </div>

        {/* Auto-create Posts */}
        <div className='flex items-center justify-between bg-secondary p-4 rounded-md'>
          <div className='flex flex-col'>
            <Label htmlFor='autoCreate'>Auto-create Posts</Label>
            <span className='text-xs text-muted-foreground'>Automatically generate and publish posts on schedule.</span>
          </div>
          <Switch id='autoCreate' checked={autoCreate} onCheckedChange={setAutoCreate} />
        </div>

        {/* Save */}
        <div className='flex justify-end pt-2'>
          <Button type='button' onClick={onSave}>
            Save Schedule
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
