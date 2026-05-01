import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, Cell, LabelList } from 'recharts';
import { computeActiveWoWDeltas, getActiveSummaryRows, getActiveWipReference, getActivePriorWipReference } from '@/lib/etc-summary-data';
import { subscribeWipStore, getWipStoreSnapshot } from '@/lib/wip-store';
import { subscribeForecastCalendarStore, getForecastCalendarStoreSnapshot } from '@/lib/forecast-calendar';
import { cn } from '@/lib/utils';

const fmtMoney = (n: number) =>
  n < 0
    ? `(${Math.abs(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })})`
    : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const fmtDelta = (n: number) => {
  if (Math.abs(n) < 1) return '$0';
  const sign = n > 0 ? '+' : '−';
  return `${sign}${Math.abs(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}`;
};

// NOTE: negative cushion is GOOD (under budget). So "favorable" delta is negative.
const favorableClass = (delta: number, goodIfPositive: boolean) => {
  if (Math.abs(delta) < 1) return 'text-muted-foreground';
  const favorable = goodIfPositive ? delta > 0 : delta < 0;
  return favorable ? 'text-success' : 'text-destructive';
};

interface CushionWaterfallProps {
  filterProjects?: string[];
}

export function CushionWaterfall({ filterProjects }: CushionWaterfallProps = {}) {
  // Re-render when WIP store changes
  useSyncExternalStore(subscribeWipStore, getWipStoreSnapshot);
  useSyncExternalStore(subscribeForecastCalendarStore, getForecastCalendarStoreSnapshot);

  const wipRef = getActiveWipReference();
  const priorWipRef = getActivePriorWipReference();

  const allDeltas = useMemo(() => computeActiveWoWDeltas(), [getWipStoreSnapshot()]);
  const orderedProjects = useMemo(
    () => getActiveSummaryRows()
      .filter((r) => !filterProjects || filterProjects.includes(r.project))
      .sort((a, b) => {
        if (b.totalForecast !== a.totalForecast) return b.totalForecast - a.totalForecast;
        return a.project.localeCompare(b.project);
      })
      .map((r) => r.project),
    [filterProjects, getWipStoreSnapshot()],
  );

  const deltas = useMemo(
    () => {
      const filtered = filterProjects && filterProjects.length > 0
        ? allDeltas.filter((d) => filterProjects.includes(d.project))
        : allDeltas;
      const rank = Object.fromEntries(orderedProjects.map((name, i) => [name, i]));
      return [...filtered].sort((a, b) => (rank[a.project] ?? 9999) - (rank[b.project] ?? 9999));
    },
    [allDeltas, filterProjects, orderedProjects],
  );
  const movers = useMemo(
    () => deltas.filter((d) => Math.abs(d.deltaCushion) >= 1).sort((a, b) => Math.abs(b.deltaCushion) - Math.abs(a.deltaCushion)),
    [deltas],
  );
  const [project, setProject] = useState<string>(deltas[0]?.project ?? '');

  useEffect(() => {
    if (!deltas.some((d) => d.project === project)) {
      setProject(deltas[0]?.project ?? '');
    }
  }, [deltas, project]);

  const selected = deltas.find((d) => d.project === project);

  const chartData = useMemo(() => {
    if (!selected) return [];
    const prior = selected.priorProjectedCushion;
    const afterRev = prior + selected.deltaNetRev;
    const afterExp = afterRev - selected.deltaExpenses;
    const afterUnb = afterExp + selected.deltaUnbilled;
    const deltaFromActuals = selected.deltaNetRev - selected.deltaExpenses + selected.deltaUnbilled;
    const deltaOther = selected.deltaCushion - deltaFromActuals;
    const afterOther = afterUnb + deltaOther;
    return [
      { name: `Prior\n(${priorWipRef})`, value: prior, kind: 'anchor' as const, delta: 0 },
      { name: 'Δ Net Rev', value: selected.deltaNetRev, kind: 'delta' as const, delta: selected.deltaNetRev, base: Math.min(prior, afterRev) },
      { name: 'Δ Expenses', value: -selected.deltaExpenses, kind: 'delta' as const, delta: -selected.deltaExpenses, base: Math.min(afterRev, afterExp) },
      { name: 'Δ Unbilled', value: selected.deltaUnbilled, kind: 'delta' as const, delta: selected.deltaUnbilled, base: Math.min(afterExp, afterUnb) },
      { name: 'Δ Other', value: deltaOther, kind: 'delta' as const, delta: deltaOther, base: Math.min(afterUnb, afterOther) },
      { name: `Current\n(${wipRef})`, value: selected.current.projectedCushion, kind: 'anchor' as const, delta: 0 },
    ];
  }, [selected]);

  // For waterfall rendering we use stacked bars: invisible "base" + visible "value"
  const waterfallData = useMemo(() => {
    if (!selected) return [];
    const prior = selected.priorProjectedCushion;
    let running = prior;
    const rows: Array<{ name: string; base: number; bar: number; total: number; isAnchor: boolean; favorable: boolean | null }> = [
      { name: `Prior\n${priorWipRef}`, base: 0, bar: prior, total: prior, isAnchor: true, favorable: null },
    ];
    const steps: Array<{ label: string; delta: number; goodIfPositive: boolean }> = [
      { label: 'Δ Net Rev', delta: selected.deltaNetRev, goodIfPositive: true },
      { label: 'Δ Expenses', delta: -selected.deltaExpenses, goodIfPositive: true }, // already negated; favorable if positive
      { label: 'Δ Unbilled', delta: selected.deltaUnbilled, goodIfPositive: true },
      {
        label: 'Δ Other',
        delta: selected.deltaCushion - (selected.deltaNetRev - selected.deltaExpenses + selected.deltaUnbilled),
        goodIfPositive: true,
      },
    ];
    for (const s of steps) {
      const next = running + s.delta;
      // Stacked-bar trick: base = min(running, next); bar = |delta|
      // But cushion can be negative — use absolute axis, anchor at 0
      // For visualization clarity, we render the bar from running to next using base+bar where total=next
      const base = Math.min(running, next);
      const bar = Math.abs(s.delta);
      // For cushion: NEGATIVE direction is favorable. So delta < 0 = favorable.
      const favorable = s.delta < 0;
      rows.push({ name: s.label, base, bar, total: next, isAnchor: false, favorable });
      running = next;
    }
    rows.push({ name: `Current\n${wipRef}`, base: 0, bar: selected.current.projectedCushion, total: selected.current.projectedCushion, isAnchor: true, favorable: null });
    return rows;
  }, [selected]);

  if (!selected) return null;

  const allValues = waterfallData.flatMap((r) => [r.base, r.base + r.bar, r.total]);
  const yMin = Math.min(...allValues, 0);
  const yMax = Math.max(...allValues, 0);
  const padding = (yMax - yMin) * 0.1;

  const primaryDriver = (() => {
    const deltaOther = selected.deltaCushion - (selected.deltaNetRev - selected.deltaExpenses + selected.deltaUnbilled);
    const drivers = [
      { label: 'Revenue', val: Math.abs(selected.deltaNetRev) },
      { label: 'Expenses', val: Math.abs(selected.deltaExpenses) },
      { label: 'Unbilled', val: Math.abs(selected.deltaUnbilled) },
      { label: 'Other', val: Math.abs(deltaOther) },
    ];
    return drivers.sort((a, b) => b.val - a.val)[0].label;
  })();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle>Cushion Waterfall — Why Did It Change?</CardTitle>
            <CardDescription>
              Walks {priorWipRef} Projected Cushion to {wipRef} for the selected project.
              <br />
              Includes an "Other" step for forecast/input timing effects not explained by WIP actuals deltas.
              <br />
              <span className="text-xs">
                Reminder: <strong>more negative cushion is favorable</strong> (under budget).
              </span>
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <Select value={project} onValueChange={setProject}>
              <SelectTrigger className="w-[240px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {deltas.map((d) => (
                  <SelectItem key={d.project} value={d.project}>
                    {d.project} {Math.abs(d.deltaCushion) >= 1 ? `(${fmtDelta(d.deltaCushion)})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="p-3 rounded-md border bg-card">
            <div className="text-[10px] uppercase text-muted-foreground">Prior Cushion</div>
            <div className={cn('text-lg font-bold mt-1', selected.priorProjectedCushion < 0 ? 'text-success' : 'text-destructive')}>
              {fmtMoney(selected.priorProjectedCushion)}
            </div>
          </div>
          <div className="p-3 rounded-md border bg-card">
            <div className="text-[10px] uppercase text-muted-foreground">Current Cushion</div>
            <div className={cn('text-lg font-bold mt-1', selected.current.projectedCushion < 0 ? 'text-success' : 'text-destructive')}>
              {fmtMoney(selected.current.projectedCushion)}
            </div>
          </div>
          <div className="p-3 rounded-md border bg-card">
            <div className="text-[10px] uppercase text-muted-foreground">WoW Δ Cushion</div>
            <div className={cn('text-lg font-bold mt-1 tabular-nums', favorableClass(selected.deltaCushion, false))}>
              {fmtDelta(selected.deltaCushion)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {selected.deltaCushion < 0 ? 'Favorable (more under)' : selected.deltaCushion > 0 ? 'Unfavorable (less under)' : 'Flat'}
            </div>
          </div>
          <div className="p-3 rounded-md border bg-card">
            <div className="text-[10px] uppercase text-muted-foreground">Primary Driver</div>
            <div className="text-lg font-bold mt-1">{primaryDriver}</div>
            <Badge variant="outline" className="mt-1 text-[10px]">this week</Badge>
          </div>
        </div>

        <div className="h-[340px] w-full">
          <ResponsiveContainer>
            <BarChart data={waterfallData} margin={{ top: 24, right: 24, left: 8, bottom: 8 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
              <YAxis
                domain={[yMin - padding, yMax + padding]}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0].payload as typeof waterfallData[number];
                  return (
                    <div className="rounded-md border bg-popover p-2 text-xs shadow-md">
                      <div className="font-semibold">{String(label).replace('\n', ' ')}</div>
                      {row.isAnchor ? (
                        <div className="text-muted-foreground">Cushion: {fmtMoney(row.total)}</div>
                      ) : (
                        <>
                          <div className={cn(row.favorable ? 'text-success' : 'text-destructive')}>
                            Step: {fmtDelta(row.total - (row.base + row.bar) + row.bar * (row.favorable ? -1 : 1))}
                          </div>
                          <div className="text-muted-foreground">Running: {fmtMoney(row.total)}</div>
                        </>
                      )}
                    </div>
                  );
                }}
              />
              <ReferenceLine y={0} stroke="hsl(var(--border))" />
              <Bar dataKey="base" stackId="w" fill="transparent" />
              <Bar dataKey="bar" stackId="w" radius={[3, 3, 0, 0]}>
                {waterfallData.map((row, i) => (
                  <Cell
                    key={i}
                    fill={
                      row.isAnchor
                        ? 'hsl(var(--primary))'
                        : row.favorable
                          ? 'hsl(var(--success))'
                          : 'hsl(var(--destructive))'
                    }
                  />
                ))}
                <LabelList
                  dataKey="total"
                  position="top"
                  formatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
                  style={{ fontSize: 10, fill: 'hsl(var(--foreground))' }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-6">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            All Projects — WoW Drivers
          </h4>
          <div className="overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Project</th>
                  <th className="text-right px-3 py-2">Δ Net Rev</th>
                  <th className="text-right px-3 py-2">Δ Expenses</th>
                  <th className="text-right px-3 py-2">Δ Unbilled</th>
                  <th className="text-right px-3 py-2">Δ Cushion</th>
                  <th className="text-left px-3 py-2">Primary Driver</th>
                </tr>
              </thead>
              <tbody>
                {deltas.map((d) => {
                  const otherDelta = d.deltaCushion - (d.deltaNetRev - d.deltaExpenses + d.deltaUnbilled);
                  const drivers = [
                    { label: 'Rev ↑↓', val: Math.abs(d.deltaNetRev) },
                    { label: 'Exp ↑↓', val: Math.abs(d.deltaExpenses) },
                    { label: 'Unbilled ↑↓', val: Math.abs(d.deltaUnbilled) },
                    { label: 'Other ↑↓', val: Math.abs(otherDelta) },
                  ].sort((a, b) => b.val - a.val);
                  const driver = drivers[0].val < 1 ? '—' : drivers[0].label;
                  return (
                    <tr
                      key={d.project}
                      className={cn(
                        'border-t cursor-pointer hover:bg-muted/30',
                        d.project === project && 'bg-primary/5',
                      )}
                      onClick={() => setProject(d.project)}
                    >
                      <td className="px-3 py-2 font-medium">{d.project}</td>
                      <td className={cn('px-3 py-2 text-right tabular-nums', favorableClass(d.deltaNetRev, true))}>
                        {fmtDelta(d.deltaNetRev)}
                      </td>
                      <td className={cn('px-3 py-2 text-right tabular-nums', favorableClass(d.deltaExpenses, false))}>
                        {fmtDelta(d.deltaExpenses)}
                      </td>
                      <td className={cn('px-3 py-2 text-right tabular-nums', favorableClass(d.deltaUnbilled, true))}>
                        {fmtDelta(d.deltaUnbilled)}
                      </td>
                      <td className={cn('px-3 py-2 text-right font-semibold tabular-nums', favorableClass(d.deltaCushion, false))}>
                        {fmtDelta(d.deltaCushion)}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{driver}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
