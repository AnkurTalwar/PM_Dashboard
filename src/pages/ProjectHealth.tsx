import { useMemo, useState, useEffect, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, ArrowRight, Settings, Shield, DollarSign, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { KpiCard } from '@/components/KpiCard';
import { computeProjectHealth, type ProjectHealth } from '@/lib/project-health';
import { loadThresholds } from '@/lib/health-thresholds';
import type { HealthStatus } from '@/lib/health-thresholds';
import { getActiveWipReference } from '@/lib/etc-summary-data';
import { cn } from '@/lib/utils';
import { getProgramPackageStoreSnapshot, subscribeProgramPackageStore } from '@/lib/program-package';

const statusStyles: Record<HealthStatus, { dot: string; badge: string; label: string }> = {
  green: { dot: 'bg-success', badge: 'bg-success/15 text-success border-success/30', label: 'Healthy' },
  yellow: { dot: 'bg-warning', badge: 'bg-warning/15 text-warning border-warning/30', label: 'Watch' },
  red: { dot: 'bg-destructive', badge: 'bg-destructive/15 text-destructive border-destructive/30', label: 'At Risk' },
  na: { dot: 'bg-muted-foreground/40', badge: 'bg-muted text-muted-foreground border-border', label: 'No Data' },
};

function StatusBadge({ status, children }: { status: HealthStatus; children?: React.ReactNode }) {
  const s = statusStyles[status];
  return (
    <Badge variant="outline" className={cn('gap-1.5 font-medium', s.badge)}>
      <span className={cn('h-2 w-2 rounded-full', s.dot)} />
      {children ?? s.label}
    </Badge>
  );
}

function fmtUsd(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function DimensionCell({
  status,
  to,
  primary,
  secondary,
}: {
  status: HealthStatus;
  to: string;
  primary: string;
  secondary?: string;
}) {
  return (
    <Link
      to={to}
      className="block rounded-md border border-transparent p-2 -m-2 hover:border-border hover:bg-muted/40 transition-colors"
    >
      <div className="flex items-center gap-2">
        <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', statusStyles[status].dot)} />
        <div className="min-w-0">
          <div className="text-sm font-medium leading-tight">{primary}</div>
          {secondary && <div className="text-xs text-muted-foreground leading-tight">{secondary}</div>}
        </div>
      </div>
    </Link>
  );
}

export default function ProjectHealth() {
  const [thresholds, setThresholds] = useState(() => loadThresholds());
  useSyncExternalStore(subscribeProgramPackageStore, getProgramPackageStoreSnapshot);

  useEffect(() => {
    const onStorage = () => setThresholds(loadThresholds());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const rows: ProjectHealth[] = useMemo(
    () => computeProjectHealth(thresholds),
    [thresholds],
  );

  const totals = useMemo(() => {
    const red = rows.filter((r) => r.overall === 'red').length;
    const yellow = rows.filter((r) => r.overall === 'yellow').length;
    const green = rows.filter((r) => r.overall === 'green').length;
    // Sum favorable cushion across green-status projects (more negative = bigger favorable)
    const favorableCushion = rows
      .filter((r) => r.etc.status === 'green')
      .reduce((s, r) => s + r.etc.projectedCushion, 0);
    return { red, yellow, green, favorableCushion };
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Project Health</h1>
          <p className="text-muted-foreground mt-1">
            FY2026 active engagements — rolled-up health across LTA, expenses, and ETC. Source: {getActiveWipReference()}.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/health/settings">
            <Settings className="h-4 w-4 mr-2" />
            Configure thresholds
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Projects At Risk" value={totals.red} icon={AlertTriangle} trend={totals.red > 0 ? 'negative' : 'positive'} />
        <KpiCard title="Watch List" value={totals.yellow} icon={Activity} trend={totals.yellow > 0 ? 'negative' : 'neutral'} />
        <KpiCard title="Healthy" value={totals.green} icon={Activity} trend="positive" />
        <KpiCard
          title="Favorable Cushion"
          value={fmtUsd(totals.favorableCushion)}
          icon={TrendingUp}
          trend={totals.favorableCushion < 0 ? 'positive' : 'neutral'}
          subtitle="Sum of green-status projected cushions (negative = under budget)"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Project Health Scorecard</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">Project</TableHead>
                <TableHead className="min-w-[160px]">
                  <span className="inline-flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" /> LTA</span>
                </TableHead>
                <TableHead className="min-w-[160px]">
                  <span className="inline-flex items-center gap-1.5"><DollarSign className="h-3.5 w-3.5" /> Expenses</span>
                </TableHead>
                <TableHead className="min-w-[180px]">
                  <span className="inline-flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> ETC Cushion</span>
                </TableHead>
                <TableHead className="text-right min-w-[120px]">Overall</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const projectParam = `?project=${encodeURIComponent(r.project.code)}`;
                return (
                  <TableRow key={r.project.code}>
                    <TableCell>
                      <div className="font-semibold">{r.project.label}</div>
                      <div className="text-xs text-muted-foreground">{r.project.code}</div>
                    </TableCell>
                    <TableCell>
                      <DimensionCell
                        status={r.lta.status}
                        to={`/lta${projectParam}`}
                        primary={`${r.lta.atRiskCount} at risk`}
                        secondary={r.lta.breachCount > 0 ? `${r.lta.breachCount} in breach` : 'No breaches'}
                      />
                    </TableCell>
                    <TableCell>
                      <DimensionCell
                        status={r.expenses.status}
                        to={`/expenses${projectParam}`}
                        primary={`${r.expenses.violationCount} violations`}
                        secondary="Per-diem + weekly"
                      />
                    </TableCell>
                    <TableCell>
                      <DimensionCell
                        status={r.etc.status}
                        to={`/etc${projectParam}`}
                        primary={fmtUsd(r.etc.projectedCushion)}
                        secondary={r.etc.row ? 'Projected cushion' : 'No ETC row'}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <StatusBadge status={r.overall} />
                    </TableCell>
                    <TableCell>
                      <Button asChild size="icon" variant="ghost">
                        <Link to={`/etc${projectParam}`} aria-label={`Drill into ${r.project.code}`}>
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How to read this</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p><span className="inline-block h-2 w-2 rounded-full bg-success mr-1.5" /> Green = within thresholds.</p>
          <p><span className="inline-block h-2 w-2 rounded-full bg-warning mr-1.5" /> Yellow = approaching limits, monitor.</p>
          <p><span className="inline-block h-2 w-2 rounded-full bg-destructive mr-1.5" /> Red = breach, action required.</p>
          <p>Click any cell to drill into the underlying tab pre-filtered to that project.</p>
        </CardContent>
      </Card>
    </div>
  );
}
