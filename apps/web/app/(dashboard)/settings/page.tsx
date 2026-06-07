"use client";

import { useQuery } from "@tanstack/react-query";

import { getBrandQueryOptions } from "@/lib/api/brand/brand-queries";
import { SettingsForm } from "@/components/settings/settings-form";
import { ErrorState, LoadingState } from "@/components/data/data-states";

export default function SettingsPage() {
  const { data, isPending, isError, refetch } = useQuery(getBrandQueryOptions());

  return (
    <main className='mx-auto w-full max-w-2xl flex-1 p-4'>
      <h1 className='mb-4 text-lg font-medium'>Settings</h1>
      {isPending ? (
        <LoadingState />
      ) : isError || !data?.brand ? (
        <ErrorState title='Could not load settings' onRetry={() => refetch()} />
      ) : (
        <SettingsForm brand={data.brand} />
      )}
    </main>
  );
}
