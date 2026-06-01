import { Card } from '@/components/ui/card';

type StatCardProps = {
  label: string;
  value: number | string;
  subtitle?: string;
};

export function StatCard({ label, value, subtitle }: StatCardProps) {
  return (
    <Card className="p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {subtitle && (
        <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>
      )}
    </Card>
  );
}
