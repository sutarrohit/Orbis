import type { LucideIcon } from "lucide-react";
import { AlertTriangle, BarChart3, Brain, Globe, Lightbulb, Send } from "lucide-react";

import type { Activity } from "@/lib/api/activity/activity-apis";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const STAT_CARDS: {
  key: string;
  label: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  compute: (data: Activity[]) => number;
}[] = [
  {
    key: "leaderPlans",
    label: "Leader Plans",
    icon: Brain,
    iconBg: "bg-blue-100 dark:bg-blue-900/40",
    iconColor: "text-blue-600 dark:text-blue-400",
    compute: (d) => d.filter((e) => e.action === "set_plan").length
  },
  {
    key: "groupsFound",
    label: "Groups Found",
    icon: Globe,
    iconBg: "bg-blue-100 dark:bg-blue-900/40",
    iconColor: "text-blue-600 dark:text-blue-400",
    compute: (d) => d.filter((e) => e.action === "research_community_done").length
  },
  {
    key: "dmsQueued",
    label: "DMs Queued",
    icon: Send,
    iconBg: "bg-purple-100 dark:bg-purple-900/40",
    iconColor: "text-purple-600 dark:text-purple-400",
    compute: (d) => d.filter((e) => e.action === "send_dm").length
  },
  {
    key: "learnings",
    label: "Learnings",
    icon: Lightbulb,
    iconBg: "bg-yellow-100 dark:bg-yellow-900/40",
    iconColor: "text-yellow-600 dark:text-yellow-400",
    compute: (d) => d.filter((e) => e.action.includes("learning")).length
  },
  {
    key: "errors",
    label: "Errors",
    icon: AlertTriangle,
    iconBg: "bg-red-100 dark:bg-red-900/40",
    iconColor: "text-red-600 dark:text-red-400",
    compute: (d) => d.filter((e) => e.action.includes("error")).length
  },
  {
    key: "totalEvents",
    label: "Total Events",
    icon: BarChart3,
    iconBg: "bg-blue-100 dark:bg-blue-900/40",
    iconColor: "text-blue-600 dark:text-blue-400",
    compute: (d) => d.length
  }
];

export function ActivityStats({ data }: { data: Activity[] }) {
  return (
    <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6'>
      {STAT_CARDS.map((stat) => (
        <Card key={stat.key} size='sm'>
          <CardContent className='flex items-center gap-3'>
            <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", stat.iconBg)}>
              <stat.icon className={cn("size-4", stat.iconColor)} />
            </div>
            <div className='min-w-0'>
              <p className='truncate text-xs text-muted-foreground'>{stat.label}</p>
              <p className='text-lg font-semibold leading-tight'>{stat.compute(data)}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
