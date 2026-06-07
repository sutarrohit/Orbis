"use client";

import { ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export function LeaderPlanDetail({ detail }: { detail: Record<string, unknown> }) {
  const cycle = detail.cycle as number | undefined;
  const actions = detail.actions as string[] | undefined;
  const instruction = detail.instruction as string | undefined;
  const summary = detail.summary as string | undefined;

  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger className="group/plan flex w-full items-center gap-2 text-sm font-medium">
        <ChevronRight className="size-4 transition-transform group-data-[state=open]/plan:rotate-90" />
        {cycle != null ? `Cycle ${cycle}` : "Plan"}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-3 pl-6">
        {actions && actions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {actions.map((a) => (
              <Badge key={a} variant="outline" className="text-[0.625rem]">
                {a}
              </Badge>
            ))}
          </div>
        )}
        {(instruction ?? summary) && (
          <p className="text-xs leading-relaxed text-muted-foreground">{instruction ?? summary}</p>
        )}
        {!actions && !instruction && !summary && (
          <pre className="overflow-x-auto rounded-md bg-muted p-2 text-xs">{JSON.stringify(detail, null, 2)}</pre>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
