import { type ReactNode } from 'react';
import { Card } from '@/components/ui/card';

type StatCardProps = {
  label: string;
  value: number | string;
  subtitle?: string;
  icon?: ReactNode;
  accent?: 'blue' | 'emerald' | 'amber' | 'rose';
};

const ACCENTS = {
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400',
};

export function StatCard({ label, value, subtitle, icon, accent = 'blue' }: StatCardProps) {
  return (
    <Card className="group relative overflow-hidden p-5 transition-all hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
          <div className="mt-2 truncate text-3xl font-bold tabular-nums">{value}</div>
          {subtitle && (
            <div className="mt-1.5 text-xs text-muted-foreground">{subtitle}</div>
          )}
        </div>
        {icon && (
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${ACCENTS[accent]}`}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
