"use client";

import { useQuery } from "@tanstack/react-query";
import { BookOpenIcon, RadioIcon, ShoppingCartIcon, UsersIcon } from "lucide-react";

import { listAccountsQueryOptions } from "@/lib/api/accounts/accounts-queries";
import { listCommunitiesQueryOptions } from "@/lib/api/communities/communities-queries";
import { listLeadsQueryOptions } from "@/lib/api/leads/leads-queries";
import { listLearningsQueryOptions } from "@/lib/api/learnings/learnings-queries";
import { formatNumber } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatsRow() {
  const accounts = useQuery(listAccountsQueryOptions());
  const communities = useQuery(listCommunitiesQueryOptions());
  const leads = useQuery(listLeadsQueryOptions());
  const learnings = useQuery(listLearningsQueryOptions());

  const activeAccounts = (accounts.data ?? []).filter((a) => a.status === "active").length;
  const totalAccounts = accounts.data?.length ?? 0;

  const totalCommunities = communities.data?.length ?? 0;

  const leadCounts = leads.data?.counts;
  const totalLeads = leadCounts ? Object.values(leadCounts).reduce((sum, n) => sum + n, 0) : 0;
  const convertedLeads = leadCounts?.converted ?? 0;

  const totalLearnings = learnings.data?.length ?? 0;

  const stats = [
    {
      label: "Gateways",
      value: `${activeAccounts}/${totalAccounts}`,
      sub: "active / total",
      icon: RadioIcon,
      color: "text-blue-500",
      borderColor: "border-blue-500/30",
      iconBg: "bg-blue-500/15"
    },
    {
      label: "Communities",
      value: formatNumber(totalCommunities),
      icon: UsersIcon,
      color: "text-purple-500",
      borderColor: "border-purple-500/30",
      iconBg: "bg-purple-500/15"
    },
    {
      label: "Total Leads",
      value: formatNumber(totalLeads),
      icon: UsersIcon,
      color: "text-emerald-500",
      borderColor: "border-emerald-500/30",
      iconBg: "bg-emerald-500/15"
    },
    {
      label: "Converted",
      value: formatNumber(convertedLeads),
      icon: ShoppingCartIcon,
      color: "text-amber-500",
      borderColor: "border-amber-500/30",
      iconBg: "bg-amber-500/15"
    },
    {
      label: "Learnings",
      value: formatNumber(totalLearnings),
      icon: BookOpenIcon,
      color: "text-rose-500",
      borderColor: "border-rose-500/30",
      iconBg: "bg-rose-500/15"
    }
  ];

  return (
    <div className='grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5'>
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          // <Card key={stat.label} className={cn("border-l-4", stat.borderColor)}>
          <Card key={stat.label}>
            <CardContent className='flex flex-col gap-1'>
              <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                <div className={cn("flex size-7 items-center justify-center rounded-lg", stat.iconBg)}>
                  <Icon className={cn("size-4", stat.color)} />
                </div>
                {stat.label}
              </div>
              <span className='text-2xl font-semibold'>{stat.value}</span>
              {stat.sub ? <span className='text-xs text-muted-foreground'>{stat.sub}</span> : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
