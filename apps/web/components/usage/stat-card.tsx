import { formatNumber } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-xs font-normal text-muted-foreground'>{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <span className='text-2xl font-semibold'>{formatNumber(value)}</span>
      </CardContent>
    </Card>
  );
}
