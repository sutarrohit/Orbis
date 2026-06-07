"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { TargetIcon } from "lucide-react";

import {
  agentConfigKeys,
  listAgentConfigQueryOptions,
  upsertAgentConfigMutationOptions
} from "@/lib/api/agent-config/agent-config-queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

export function LeaderGoals() {
  const queryClient = useQueryClient();
  const { data: configs } = useQuery(listAgentConfigQueryOptions());
  const leaderConfig = configs?.find((c) => c.agentType === "leader");

  const [goals, setGoals] = useState<string | null>(null);
  const displayValue = goals ?? leaderConfig?.systemPrompt ?? "";

  const upsert = useMutation({
    ...upsertAgentConfigMutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentConfigKeys.all });
      setGoals(null);
      toast.success("Leader goals updated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save goals")
  });

  const isDirty = goals !== null && goals !== (leaderConfig?.systemPrompt ?? "");

  return (
    <Card>
      <CardContent className='flex flex-col gap-3 p-4'>
        <div className='flex items-center gap-2'>
          <TargetIcon className='size-5' />
          <h2 className='text-lg font-semibold'>Leader Goals</h2>
        </div>
        <p className='text-xs text-muted-foreground'>
          Set high-level goals for the Leader agent. These guide its strategy planning and execution cycle.
        </p>
        <Textarea
          placeholder='e.g. Focus on Web3 gaming communities. Prioritize hot leads. Aim for 10 new prospects per week.'
          rows={4}
          value={displayValue}
          onChange={(e) => setGoals(e.target.value)}
        />
        <div className='flex justify-end'>
          <Button
            size='sm'
            onClick={() => upsert.mutate({ agentType: "leader", systemPrompt: goals ?? "" })}
            disabled={!isDirty || upsert.isPending}
          >
            {upsert.isPending ? <Spinner className='mr-1' /> : null}
            Set Goals
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
