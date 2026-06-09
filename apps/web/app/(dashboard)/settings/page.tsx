"use client";

import { useQuery } from "@tanstack/react-query";

import { getBrandQueryOptions } from "@/lib/api/brand/brand-queries";
import { AccountDetails } from "@/components/settings/account-details";
import { DangerZone } from "@/components/settings/danger-zone";
import { SettingsForm } from "@/components/settings/settings-form";
import { RateLimits } from "@/components/settings/rate-limits";
import { SquadSchedule } from "@/components/settings/squad-schedule";
import { TelegramConnection } from "@/components/settings/telegram-connection";
import { TokenExpenses } from "@/components/settings/token-expenses";
import { ErrorState, LoadingState } from "@/components/data/data-states";

export default function SettingsPage() {
  const { data, isPending, isError, refetch } = useQuery(getBrandQueryOptions());

  return (
    <main className='mx-auto w-full max-w-5xl flex-1 p-4'>
      <h1 className='mb-4 text-lg font-medium'>Settings</h1>
      {isPending ? (
        <LoadingState />
      ) : isError || !data?.brand ? (
        <ErrorState title='Could not load settings' onRetry={() => refetch()} />
      ) : (
        <div className='flex flex-col gap-4'>
          <SettingsForm brand={data.brand} />
          <TelegramConnection />
          <SquadSchedule />
          <RateLimits />
          <TokenExpenses />
          <AccountDetails />
          <DangerZone />
        </div>
      )}
    </main>
  );
}
