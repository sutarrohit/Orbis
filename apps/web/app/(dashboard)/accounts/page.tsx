"use client";

import { useQuery } from "@tanstack/react-query";
import { CircleUser } from "lucide-react";

import { listAccountsQueryOptions } from "@/lib/api/accounts/accounts-queries";
import { AccountRow } from "@/components/accounts/account-row";
import { ConnectAccountDialog } from "@/components/accounts/connect-account-dialog";
import { EmptyState, ErrorState, TableLoadingRows } from "@/components/data/data-states";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function AccountsPage() {
  const { data, isPending, isError, refetch } = useQuery(listAccountsQueryOptions());

  return (
    <main className='flex flex-1 flex-col gap-4 p-4'>
      <div className='flex items-center justify-between'>
        <h1 className='text-lg font-medium'>Accounts</h1>
        <ConnectAccountDialog />
      </div>

      {isError ? (
        <ErrorState title='Could not load accounts' onRetry={() => refetch()} />
      ) : !isPending && data && data.length === 0 ? (
        <EmptyState
          icon={<CircleUser />}
          title='No accounts yet'
          description='Connect a Telegram account to start joining communities and sending messages.'
        />
      ) : (
        <div className='rounded-xl border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Handle</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Communities</TableHead>
                <TableHead>Last check</TableHead>
                <TableHead className='text-right'>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending ? (
                <TableLoadingRows columns={6} />
              ) : (
                data?.map((account) => <AccountRow key={account.id} account={account} />)
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}
