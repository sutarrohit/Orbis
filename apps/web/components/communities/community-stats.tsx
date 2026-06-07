import { CircleCheck, CircleDot, Hash, TriangleAlert } from "lucide-react";

import type { Community } from "@/lib/api/communities/communities-apis";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
    compute: (data: Community[]) => data.length
  },
  {
    key: "joined",
    label: "Joined",
    icon: CircleCheck,
    cardClass: "",
    iconBg: "bg-green-100 dark:bg-green-900/40",
    iconColor: "text-green-600 dark:text-green-400",
    labelClass: "text-muted-foreground",
    valueClass: "",
    compute: (data: Community[]) => data.filter((c) => c.status === "joined").length
  },
  {
    key: "pending",
    label: "Pending",
    icon: CircleDot,
    cardClass: "",
    iconBg: "bg-blue-100 dark:bg-blue-900/40",
    iconColor: "text-blue-600 dark:text-blue-400",
    labelClass: "text-muted-foreground",
    valueClass: "",
    compute: (data: Community[]) => data.filter((c) => c.status === "pending_join").length
  },
  {
    key: "rejected",
    label: "Rejected",
    icon: TriangleAlert,
    cardClass: "",
    iconBg: "bg-orange-100 dark:bg-orange-900/40",
    iconColor: "text-orange-600 dark:text-orange-400",
    labelClass: "text-muted-foreground",
    valueClass: "",
    compute: (data: Community[]) => data.filter((c) => c.status === "rejected").length
  }
] as const;

export function CommunityStats({ data }: { data: Community[] }) {
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
