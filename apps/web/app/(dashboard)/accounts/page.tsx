"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, CircleUser } from "lucide-react";

import type { Account } from "@/lib/api/accounts/accounts-apis";
import {
  accountKeys,
  deleteAccountMutationOptions,
  listAccountsQueryOptions,
  updateAccountMutationOptions
} from "@/lib/api/accounts/accounts-queries";
import type { SocialAccountStatus } from "@/lib/api/enums";
import { ConnectAccountDialog } from "@/components/accounts/connect-account-dialog";
import { EmptyState, ErrorState, TableLoadingRows } from "@/components/data/data-states";
import { StatusBadge } from "@/components/data/status-badge";
import { formatRelativeTime } from "@/lib/format";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STATUSES: SocialAccountStatus[] = ["active", "paused", "restricted"];

function AccountRow({ account }: { account: Account }) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: accountKeys.all });

  const updateM = useMutation({
    ...updateAccountMutationOptions(),
    onSuccess: () => {
      invalidate();
      toast.success("Account updated");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Update failed")
  });

  const deleteM = useMutation({
    ...deleteAccountMutationOptions(),
    onSuccess: () => {
      invalidate();
      toast.success("Account deleted");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Delete failed")
  });

  const counts = account.communityCounts;

  return (
    <TableRow>
      <TableCell>
        <div className='font-medium'>{account.handle}</div>
        {account.displayName ? <div className='text-xs text-muted-foreground'>{account.displayName}</div> : null}
      </TableCell>
      <TableCell className='capitalize'>{account.platform}</TableCell>
      <TableCell>
        <StatusBadge kind='account' value={account.status} />
      </TableCell>
      <TableCell className='text-muted-foreground'>
        {counts.joined} joined / {counts.total} total
        {counts.pending > 0 ? ` · ${counts.pending} pending` : ""}
      </TableCell>
      <TableCell className='text-muted-foreground'>{formatRelativeTime(account.lastHealthCheckAt) || "—"}</TableCell>
      <TableCell>
        <div className='flex items-center justify-end gap-2'>
          <Select
            value={account.status}
            onValueChange={(value) =>
              updateM.mutate({ id: account.id, input: { status: value as SocialAccountStatus } })
            }
            disabled={updateM.isPending}
          >
            <SelectTrigger size='sm' className='w-32'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s} className='capitalize'>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant='ghost' size='icon' aria-label='Delete account'>
                <Trash2 />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes {account.handle} and its connection. This can&apos;t be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteM.mutate(account.id)}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </TableCell>
    </TableRow>
  );
}

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
