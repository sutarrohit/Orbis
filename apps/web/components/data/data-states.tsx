import type * as React from "react";

import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { TableCell, TableRow } from "@/components/ui/table";

/** Centered spinner for full-area / card loading. */
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className='flex min-h-40 w-full items-center justify-center gap-2 text-muted-foreground'>
      <Spinner />
      <span className='text-sm'>{label}</span>
    </div>
  );
}

/** Skeleton rows for a loading table body. Renders `rows` rows of `columns` cells. */
export function TableLoadingRows({ columns, rows = 5 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <TableRow key={r}>
          {Array.from({ length: columns }).map((_, c) => (
            <TableCell key={c}>
              <Skeleton className='h-4 w-full' />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

/** Empty state built on shadcn's Empty primitives. */
export function EmptyState({
  icon,
  title,
  description,
  action
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <Empty>
      <EmptyHeader>
        {icon ? <EmptyMedia variant='icon'>{icon}</EmptyMedia> : null}
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}

/** Error state built on shadcn's Empty primitives, with an optional retry. */
export function ErrorState({
  icon,
  title = "Something went wrong",
  description,
  onRetry
}: {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <Empty>
      <EmptyHeader>
        {icon ? <EmptyMedia variant='icon'>{icon}</EmptyMedia> : null}
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {onRetry ? (
        <EmptyContent>
          <Button variant='outline' size='sm' onClick={onRetry}>
            Try again
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
