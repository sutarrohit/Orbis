import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { StatsRow } from "@/components/dashboard/stats-row";
import { AgentControlCenter } from "@/components/dashboard/agent-control-center";
import { LeaderGoals } from "@/components/dashboard/leader-goals";
import { ActivityFeed } from "@/components/dashboard/activity-feed";

export default function DashboardHome() {
  return (
    <main className='flex flex-1 flex-col gap-6 p-4 md:p-6'>
      <DashboardHeader />
      <StatsRow />
      <AgentControlCenter />
      <LeaderGoals />
      <ActivityFeed />
    </main>
  );
}
