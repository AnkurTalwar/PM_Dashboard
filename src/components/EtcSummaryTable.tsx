import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowDownRight, ArrowUpRight, GripVertical, Minus } from 'lucide-react';
import {
  getActiveSummaryRows,
  computeActiveWoWDeltas,
  type EtcSummaryRow,
  type EtcWoWDelta,
} from '@/lib/etc-summary-data';
import { getActiveProjects } from '@/lib/program-package';
import {
  subscribeWipStore,
  getWipStoreSnapshot,
} from '@/lib/wip-store';
import { subscribeForecastCalendarStore, getForecastCalendarStoreSnapshot } from '@/lib/forecast-calendar';
import { cn } from '@/lib/utils';

const fmtMoney = (n: number | null | undefined) =>
  n == null
    ? '—'
    : n < 0
      ? `(${Math.abs(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).replace('$', '$')})`
      : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const fmtDelta = (n: number) => {
  if (Math.abs(n) < 1) return '—';
  const sign = n > 0 ? '+' : '−';
  return `${sign}${Math.abs(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}`;
};

const negClass = (n: number) => (n < 0 ? 'text-destructive' : n > 0 ? 'text-foreground' : 'text-muted-foreground');

// For deltas, the "good" direction depends on the metric.
// goodIfPositive=true → positive delta is favorable (e.g. cushion, revenue)
// goodIfPositive=false → negative delta is favorable (e.g. expenses)
const deltaClass = (n: number, goodIfPositive = true) => {
  if (Math.abs(n) < 1) return 'text-muted-foreground';
  const favorable = goodIfPositive ? n > 0 : n < 0;
  return favorable ? 'text-success' : 'text-destructive';
};

const DeltaIcon = ({ n, goodIfPositive = true }: { n: number; goodIfPositive?: boolean }) => {
  if (Math.abs(n) < 1) return <Minus className="inline h-3 w-3 text-muted-foreground" />;
  const favorable = goodIfPositive ? n > 0 : n < 0;
  const Icon = n > 0 ? ArrowUpRight : ArrowDownRight;
  return <Icon className={cn('inline h-3 w-3', favorable ? 'text-success' : 'text-destructive')} />;
};

interface SectionProps {
  rows: EtcSummaryRow[];
  showWoW: boolean;
  deltasByProject: Record<string, EtcWoWDelta>;
  statusByProject: Record<string, 'Open' | 'Closed'>;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

function Section({ rows, showWoW, deltasByProject, statusByProject, onReorder }: SectionProps) {
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const totals = rows.reduce(
    (acc, r) => {
      acc.sowFees += r.sowFees;
      acc.netEngagementRevenue += r.netEngagementRevenue;
      acc.expenses += r.expenses;
      acc.cashCollected += r.cashCollected;
      acc.remainingCashToCollect += r.remainingCashToCollect;
      acc.currentUnbilledFromWip += r.currentUnbilledFromWip;
      acc.cushionBeforeForecast += r.cushionBeforeForecast;
      acc.totalForecast += r.totalForecast;
      acc.forecastedNonRecoverableExpenses += r.forecastedNonRecoverableExpenses;
      acc.promotionImpact += r.promotionImpact;
      acc.projectedCushion += r.projectedCushion;
      const d = deltasByProject[r.project];
      if (d) {
        acc.dRev += d.deltaNetRev;
        acc.dExp += d.deltaExpenses;
        acc.dUnb += d.deltaUnbilled;
        acc.dCushion += d.deltaCushion;
      }
      return acc;
    },
    {
      sowFees: 0, netEngagementRevenue: 0, expenses: 0, cashCollected: 0,
      remainingCashToCollect: 0, currentUnbilledFromWip: 0, cushionBeforeForecast: 0,
      totalForecast: 0, forecastedNonRecoverableExpenses: 0, promotionImpact: 0, projectedCushion: 0,
      dRev: 0, dExp: 0, dUnb: 0, dCushion: 0,
    },
  );

  return (
    <div className="mb-6">
      <div className="overflow-auto border rounded-md">
        <Table>
          <TableHeader className="bg-card">
            <TableRow>
              <TableHead className="w-8 sticky left-0 bg-card" />
              <TableHead className="min-w-[180px] sticky left-8 bg-card">Project Umbrella</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">SOW Fees</TableHead>
              <TableHead className="text-right border-l border-l-border bg-muted/20">
                <div className="text-[10px] uppercase text-muted-foreground">Actuals (WIP)</div>
                Net Eng Rev
              </TableHead>
              {showWoW && (
                <TableHead className="text-right bg-muted/20 text-xs">
                  <div className="text-[10px] uppercase text-muted-foreground">WoW Δ</div>
                  Rev
                </TableHead>
              )}
              <TableHead className="text-right bg-muted/20">Expenses</TableHead>
              {showWoW && (
                <TableHead className="text-right bg-muted/20 text-xs">
                  <div className="text-[10px] uppercase text-muted-foreground">WoW Δ</div>
                  Exp
                </TableHead>
              )}
              <TableHead className="text-right bg-muted/20">Cash Collected</TableHead>
              <TableHead className="text-right bg-muted/20">Remaining AR</TableHead>
              <TableHead className="text-right bg-muted/20">Unbilled WIP</TableHead>
              {showWoW && (
                <TableHead className="text-right bg-muted/20 text-xs">
                  <div className="text-[10px] uppercase text-muted-foreground">WoW Δ</div>
                  Unbilled
                </TableHead>
              )}
              <TableHead className="text-right border-l border-l-border font-semibold">
                <div className="text-[10px] uppercase text-muted-foreground">Walkforward</div>
                Cushion Pre-Fcst
              </TableHead>
              <TableHead className="text-right border-l border-l-border bg-primary/5">
                <div className="text-[10px] uppercase text-muted-foreground">Forecast</div>
                Total Forecast
              </TableHead>
              <TableHead className="text-right bg-primary/5">Non-Recov Exp</TableHead>
              <TableHead className="text-right bg-primary/5">Promo Impact</TableHead>
              <TableHead className="text-right border-l border-l-border font-bold bg-primary/10">
                <div className="text-[10px] uppercase text-muted-foreground">= ETC</div>
                Projected Cushion
              </TableHead>
              {showWoW && (
                <TableHead className="text-right bg-primary/10 font-semibold">
                  <div className="text-[10px] uppercase text-muted-foreground">WoW Δ</div>
                  Cushion
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, index) => {
              const d = deltasByProject[r.project];
              const isDragOver = dragOverIndex === index;
              return (
                <TableRow
                  key={r.project}
                  draggable
                  onDragStart={() => { dragIndexRef.current = index; }}
                  onDragOver={(e) => { e.preventDefault(); setDragOverIndex(index); }}
                  onDragLeave={() => setDragOverIndex(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = dragIndexRef.current;
                    if (from !== null && from !== index) onReorder(from, index);
                    dragIndexRef.current = null;
                    setDragOverIndex(null);
                  }}
                  onDragEnd={() => { dragIndexRef.current = null; setDragOverIndex(null); }}
                  className={isDragOver ? 'border-t-2 border-primary' : undefined}
                >
                  <TableCell className="w-8 sticky left-0 bg-card cursor-grab active:cursor-grabbing px-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                  <TableCell className="font-medium sticky left-8 bg-card">{r.project}</TableCell>
                  <TableCell>
                    <Badge variant={statusByProject[r.project] === 'Open' ? 'default' : 'secondary'}>
                      {statusByProject[r.project] ?? 'Open'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{fmtMoney(r.sowFees)}</TableCell>
                  <TableCell className="text-right border-l border-l-border bg-muted/10">{fmtMoney(r.netEngagementRevenue)}</TableCell>
                  {showWoW && (
                    <TableCell className={cn('text-right bg-muted/10 text-xs tabular-nums', deltaClass(d?.deltaNetRev ?? 0, true))}>
                      <DeltaIcon n={d?.deltaNetRev ?? 0} /> {fmtDelta(d?.deltaNetRev ?? 0)}
                    </TableCell>
                  )}
                  <TableCell className="text-right bg-muted/10">{fmtMoney(r.expenses)}</TableCell>
                  {showWoW && (
                    <TableCell className={cn('text-right bg-muted/10 text-xs tabular-nums', deltaClass(d?.deltaExpenses ?? 0, false))}>
                      <DeltaIcon n={d?.deltaExpenses ?? 0} goodIfPositive={false} /> {fmtDelta(d?.deltaExpenses ?? 0)}
                    </TableCell>
                  )}
                  <TableCell className="text-right bg-muted/10">{fmtMoney(r.cashCollected)}</TableCell>
                  <TableCell className="text-right bg-muted/10">{fmtMoney(r.remainingCashToCollect)}</TableCell>
                  <TableCell className={cn('text-right bg-muted/10', negClass(r.currentUnbilledFromWip))}>
                    {fmtMoney(r.currentUnbilledFromWip)}
                  </TableCell>
                  {showWoW && (
                    <TableCell className={cn('text-right bg-muted/10 text-xs tabular-nums', deltaClass(d?.deltaUnbilled ?? 0, true))}>
                      <DeltaIcon n={d?.deltaUnbilled ?? 0} /> {fmtDelta(d?.deltaUnbilled ?? 0)}
                    </TableCell>
                  )}
                  <TableCell className={cn('text-right border-l border-l-border font-medium', negClass(r.cushionBeforeForecast))}>
                    {fmtMoney(r.cushionBeforeForecast)}
                  </TableCell>
                  <TableCell className="text-right border-l border-l-border bg-primary/5">{fmtMoney(r.totalForecast)}</TableCell>
                  <TableCell className="text-right bg-primary/5">{fmtMoney(r.forecastedNonRecoverableExpenses)}</TableCell>
                  <TableCell className="text-right bg-primary/5">{fmtMoney(r.promotionImpact)}</TableCell>
                  <TableCell className={cn('text-right border-l border-l-border font-bold bg-primary/10', negClass(r.projectedCushion))}>
                    {fmtMoney(r.projectedCushion)}
                  </TableCell>
                  {showWoW && (
                    <TableCell className={cn('text-right bg-primary/10 font-semibold tabular-nums', deltaClass(d?.deltaCushion ?? 0, true))}>
                      <DeltaIcon n={d?.deltaCushion ?? 0} /> {fmtDelta(d?.deltaCushion ?? 0)}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            <TableRow className="bg-muted/40 font-semibold border-t-2">
              <TableCell className="sticky left-0 bg-muted/40 w-8" />
              <TableCell className="sticky left-8 bg-muted/40">Total</TableCell>
              <TableCell>—</TableCell>
              <TableCell className="text-right">{fmtMoney(totals.sowFees)}</TableCell>
              <TableCell className="text-right border-l border-l-border">{fmtMoney(totals.netEngagementRevenue)}</TableCell>
              {showWoW && (
                <TableCell className={cn('text-right text-xs tabular-nums', deltaClass(totals.dRev, true))}>{fmtDelta(totals.dRev)}</TableCell>
              )}
              <TableCell className="text-right">{fmtMoney(totals.expenses)}</TableCell>
              {showWoW && (
                <TableCell className={cn('text-right text-xs tabular-nums', deltaClass(totals.dExp, false))}>{fmtDelta(totals.dExp)}</TableCell>
              )}
              <TableCell className="text-right">{fmtMoney(totals.cashCollected)}</TableCell>
              <TableCell className="text-right">{fmtMoney(totals.remainingCashToCollect)}</TableCell>
              <TableCell className={cn('text-right', negClass(totals.currentUnbilledFromWip))}>
                {fmtMoney(totals.currentUnbilledFromWip)}
              </TableCell>
              {showWoW && (
                <TableCell className={cn('text-right text-xs tabular-nums', deltaClass(totals.dUnb, true))}>{fmtDelta(totals.dUnb)}</TableCell>
              )}
              <TableCell className={cn('text-right border-l border-l-border', negClass(totals.cushionBeforeForecast))}>
                {fmtMoney(totals.cushionBeforeForecast)}
              </TableCell>
              <TableCell className="text-right border-l border-l-border">{fmtMoney(totals.totalForecast)}</TableCell>
              <TableCell className="text-right">{fmtMoney(totals.forecastedNonRecoverableExpenses)}</TableCell>
              <TableCell className="text-right">{fmtMoney(totals.promotionImpact)}</TableCell>
              <TableCell className={cn('text-right border-l border-l-border bg-primary/10', negClass(totals.projectedCushion))}>
                {fmtMoney(totals.projectedCushion)}
              </TableCell>
              {showWoW && (
                <TableCell className={cn('text-right bg-primary/10 font-bold tabular-nums', deltaClass(totals.dCushion, true))}>
                  {fmtDelta(totals.dCushion)}
                </TableCell>
              )}
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

interface EtcSummaryTableProps {
  filterProjects?: string[];
  showWoW?: boolean;
  wipRef?: string;
  priorWipRef?: string;
}

export function EtcSummaryTable({
  filterProjects,
  showWoW = true,
  wipRef = '',
  priorWipRef = '',
}: EtcSummaryTableProps = {}) {
  const [rowOrder, setRowOrder] = useState<string[]>([]);

  // Re-render when WIP store changes
  const wipState = useSyncExternalStore(subscribeWipStore, getWipStoreSnapshot);
  useSyncExternalStore(subscribeForecastCalendarStore, getForecastCalendarStoreSnapshot);

  const allRows = useMemo(() => getActiveSummaryRows(), [wipState.current?.id]);
  const activeRows = useMemo(
    () => (filterProjects && filterProjects.length > 0 ? allRows.filter((r) => filterProjects.includes(r.project)) : allRows),
    [allRows, filterProjects],
  );

  const defaultRowOrder = useMemo(
    () => [...activeRows]
      .sort((a, b) => {
        if (b.totalForecast !== a.totalForecast) return b.totalForecast - a.totalForecast;
        return a.project.localeCompare(b.project);
      })
      .map((r) => r.project),
    [activeRows],
  );

  // Reset row order when the underlying rows change
  useEffect(() => {
    setRowOrder(defaultRowOrder);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultRowOrder.join(',')]);

  const orderedRows = useMemo(() => {
    if (rowOrder.length === 0) return activeRows;
    const indexMap = Object.fromEntries(rowOrder.map((name, i) => [name, i]));
    return [...activeRows].sort((a, b) => (indexMap[a.project] ?? 999) - (indexMap[b.project] ?? 999));
  }, [activeRows, rowOrder]);

  const handleReorder = (fromIndex: number, toIndex: number) => {
    setRowOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };
  const statusByProject = useMemo(() => {
    const fromProjects = Object.fromEntries(
      getActiveProjects().map((p) => {
        const statusText = (p.status ?? '').trim().toLowerCase();
        const isClosed = statusText.includes('closed') || statusText.includes('complete');
        return [p.name, isClosed ? 'Closed' : 'Open'];
      }),
    ) as Record<string, 'Open' | 'Closed'>;

    const fromWip = Object.fromEntries(
      (wipState.current?.rollups ?? [])
        .filter((r) => !!r.status)
        .map((r) => [r.project, r.status as 'Open' | 'Closed']),
    ) as Record<string, 'Open' | 'Closed'>;

    return { ...fromProjects, ...fromWip };
  }, [wipState.current?.id]);

  const deltas = useMemo(() => computeActiveWoWDeltas(), [wipState.current?.id, wipState.prior?.id]);
  const deltasByProject = useMemo(
    () => Object.fromEntries(deltas.map((d) => [d.project, d])),
    [deltas],
  );

  const grand = orderedRows.reduce(
    (acc, r) => {
      acc.sowFees += r.sowFees;
      acc.cushionBeforeForecast += r.cushionBeforeForecast;
      acc.totalForecast += r.totalForecast;
      acc.projectedCushion += r.projectedCushion;
      return acc;
    },
    { sowFees: 0, cushionBeforeForecast: 0, totalForecast: 0, projectedCushion: 0 },
  );

  const grandDeltaCushion = deltas.reduce((s, d) => s + d.deltaCushion, 0);
  const priorGrandCushion = grand.projectedCushion - grandDeltaCushion;
  const moversFavorable = deltas.filter((d) => d.deltaCushion > 1).length;
  const moversUnfavorable = deltas.filter((d) => d.deltaCushion < -1).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle>Project Walkforward — Estimate to Complete</CardTitle>
            <CardDescription>
              Rolled up by project umbrella. Full ETC recomputed for {wipRef} and {priorWipRef} snapshots.
              <br />
              <span className="text-xs">
                ΔCushion = Current Projected Cushion − Prior Projected Cushion.
              </span>
            </CardDescription>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="outline">{wipRef}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {showWoW && (
          <div className="mb-6 p-4 rounded-md border bg-muted/20">
            <div className="flex items-center gap-2 mb-3">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Week-over-Week Cushion Movement
              </h4>
              <Badge variant="secondary" className="text-xs">
                {priorWipRef} → {wipRef}
              </Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 rounded-md border bg-card">
                <div className="text-[10px] uppercase text-muted-foreground">Prior ETC</div>
                <div className={cn('text-lg font-bold mt-1', negClass(priorGrandCushion))}>
                  {fmtMoney(priorGrandCushion)}
                </div>
              </div>
              <div className="p-3 rounded-md border bg-card">
                <div className="text-[10px] uppercase text-muted-foreground">Current ETC</div>
                <div className={cn('text-lg font-bold mt-1', negClass(grand.projectedCushion))}>
                  {fmtMoney(grand.projectedCushion)}
                </div>
              </div>
              <div className="p-3 rounded-md border bg-card">
                <div className="text-[10px] uppercase text-muted-foreground">Net WoW Δ</div>
                <div className={cn('text-lg font-bold mt-1 tabular-nums flex items-center gap-1', deltaClass(grandDeltaCushion, true))}>
                  <DeltaIcon n={grandDeltaCushion} /> {fmtDelta(grandDeltaCushion)}
                </div>
              </div>
              <div className="p-3 rounded-md border bg-card">
                <div className="text-[10px] uppercase text-muted-foreground">Movers</div>
                <div className="text-lg font-bold mt-1">
                  <span className="text-success">{moversFavorable}↑</span>
                  <span className="text-muted-foreground mx-1">/</span>
                  <span className="text-destructive">{moversUnfavorable}↓</span>
                </div>
              </div>
            </div>
            {deltas.filter((d) => Math.abs(d.deltaCushion) >= 1).length > 0 && (
              <div className="mt-3">
                <div className="text-[10px] uppercase text-muted-foreground mb-2">Top Movers</div>
                <div className="flex flex-wrap gap-2">
                  {deltas
                    .filter((d) => Math.abs(d.deltaCushion) >= 1)
                    .sort((a, b) => Math.abs(b.deltaCushion) - Math.abs(a.deltaCushion))
                    .map((d) => (
                      <Badge
                        key={d.project}
                        variant="outline"
                        className={cn('font-mono text-xs', deltaClass(d.deltaCushion, true))}
                      >
                        {d.project}: {fmtDelta(d.deltaCushion)}
                      </Badge>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        <Section rows={orderedRows} showWoW={showWoW} deltasByProject={deltasByProject} statusByProject={statusByProject} onReorder={handleReorder} />

        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-md border bg-card">
            <div className="text-xs uppercase text-muted-foreground">Total SOW Fees</div>
            <div className="text-xl font-bold mt-1">{fmtMoney(grand.sowFees)}</div>
          </div>
          <div className="p-4 rounded-md border bg-card">
            <div className="text-xs uppercase text-muted-foreground">Cushion Before Forecast</div>
            <div className={cn('text-xl font-bold mt-1', negClass(grand.cushionBeforeForecast))}>
              {fmtMoney(grand.cushionBeforeForecast)}
            </div>
          </div>
          <div className="p-4 rounded-md border bg-card">
            <div className="text-xs uppercase text-muted-foreground">Remaining Forecast</div>
            <div className="text-xl font-bold mt-1">{fmtMoney(grand.totalForecast)}</div>
          </div>
          <div className="p-4 rounded-md border bg-primary/10">
            <div className="text-xs uppercase text-muted-foreground">Projected Cushion (ETC)</div>
            <div className={cn('text-xl font-bold mt-1', negClass(grand.projectedCushion))}>
              {fmtMoney(grand.projectedCushion)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
