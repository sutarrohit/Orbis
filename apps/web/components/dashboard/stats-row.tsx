"use client";

import { useQuery } from "@tanstack/react-query";
import { BookOpenIcon, RadioIcon, ShoppingCartIcon, UsersIcon } from "lucide-react";

import { listAccountsQueryOptions } from "@/lib/api/accounts/accounts-queries";
import { listCommunitiesQueryOptions } from "@/lib/api/communities/communities-queries";
import { listLeadsQueryOptions } from "@/lib/api/leads/leads-queries";
import { listLearningsQueryOptions } from "@/lib/api/learnings/learnings-queries";
import { formatNumber } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";

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
      icon: <RadioIcon className='size-4 text-muted-foreground' />
    },
    {
      label: "Communities",
      value: formatNumber(totalCommunities),
      icon: <UsersIcon className='size-4 text-muted-foreground' />
    },
    {
      label: "Total Leads",
      value: formatNumber(totalLeads),
      icon: <UsersIcon className='size-4 text-muted-foreground' />
    },
    {
      label: "Converted",
      value: formatNumber(convertedLeads),
      icon: <ShoppingCartIcon className='size-4 text-muted-foreground' />
    },
    {
      label: "Learnings",
      value: formatNumber(totalLearnings),
      icon: <BookOpenIcon className='size-4 text-muted-foreground' />
    }
  ];

  return (
    <div className='grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5'>
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className='flex flex-col gap-1 p-4'>
            <div className='flex items-center gap-2 text-sm text-muted-foreground'>
              {stat.icon}
              {stat.label}
            </div>
            <span className='text-2xl font-semibold'>{stat.value}</span>
            {stat.sub ? <span className='text-xs text-muted-foreground'>{stat.sub}</span> : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
