import { CalendarDays, Hash, Layers, CalendarCheck } from "lucide-react";

import type { Learning } from "@/lib/api/learnings/learnings-apis";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function startOfWeek(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(diff);
  return d;
}

function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

const STAT_CARDS = [
  {
    key: "total",
    label: "Total",
    icon: Hash,
    cardClass: "bg-primary text-primary-foreground",
    iconBg: "bg-primary-foreground/20",
    iconColor: "text-primary-foreground",
    labelClass: "text-primary-foreground/70",
    valueClass: "text-primary-foreground",
    compute: (data: Learning[]) => data.length
  },
  {
    key: "thisWeek",
    label: "This Week",
    icon: CalendarDays,
    cardClass: "",
    iconBg: "bg-green-100 dark:bg-green-900/40",
    iconColor: "text-green-600 dark:text-green-400",
    labelClass: "text-muted-foreground",
    valueClass: "",
    compute: (data: Learning[]) => {
      const weekStart = startOfWeek();
      return data.filter((l) => new Date(l.createdAt) >= weekStart).length;
    }
  },
  {
    key: "thisMonth",
    label: "This Month",
    icon: CalendarCheck,
    cardClass: "",
    iconBg: "bg-blue-100 dark:bg-blue-900/40",
    iconColor: "text-blue-600 dark:text-blue-400",
    labelClass: "text-muted-foreground",
    valueClass: "",
    compute: (data: Learning[]) => {
      const monthStart = startOfMonth();
      return data.filter((l) => new Date(l.createdAt) >= monthStart).length;
    }
  },
  {
    key: "categories",
    label: "Categories",
    icon: Layers,
    cardClass: "",
    iconBg: "bg-orange-100 dark:bg-orange-900/40",
    iconColor: "text-orange-600 dark:text-orange-400",
    labelClass: "text-muted-foreground",
    valueClass: "",
    compute: () => 0
  }
] as const;

export function LearningStats({ data }: { data: Learning[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {STAT_CARDS.map((stat) => (
        <Card key={stat.key} size="sm" className={cn(stat.cardClass)}>
          <CardContent className="flex items-center gap-3 p-3">
            <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", stat.iconBg)}>
              <stat.icon className={cn("size-4", stat.iconColor)} />
            </div>
            <div className="min-w-0">
              <p className={cn("truncate text-xs", stat.labelClass)}>{stat.label}</p>
              <p className={cn("text-lg font-semibold leading-tight", stat.valueClass)}>{stat.compute(data)}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
