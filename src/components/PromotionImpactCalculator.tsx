import { useMemo, useState, useSyncExternalStore } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { getActiveSummaryRows } from '@/lib/etc-summary-data';
import { subscribeWipStore, getWipStoreSnapshot } from '@/lib/wip-store';
import { subscribeForecastCalendarStore, getForecastCalendarStoreSnapshot } from '@/lib/forecast-calendar';
import {
  getActiveResources,
  subscribeProgramPackageStore,
  getProgramPackageStoreSnapshot,
} from '@/lib/program-package';
import { cn } from '@/lib/utils';

const fmtMoney = (n: number) =>
  n < 0
    ? `(${Math.abs(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })})`
    : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const cushionClass = (n: number) => (n < 0 ? 'text-success' : n > 0 ? 'text-destructive' : 'text-muted-foreground');

// Standard rates per level (FY26) — used as defaults for the new level
const LEVEL_RATES: Record<string, number> = {
  'PARTNER': 1345,
  'SR. MANAGER/DIRECTOR': 1270,
  'MANAGER': 1130,
  'SENIOR ASSOCIATE': 955,
  'ASSOCIATE': 645,
};

const LEVELS = Object.keys(LEVEL_RATES);

export function PromotionImpactCalculator() {
  useSyncExternalStore(subscribeWipStore, getWipStoreSnapshot);
  useSyncExternalStore(subscribeForecastCalendarStore, getForecastCalendarStoreSnapshot);
  useSyncExternalStore(subscribeProgramPackageStore, getProgramPackageStoreSnapshot);
  const activeRows = useMemo(() => getActiveSummaryRows(), [getWipStoreSnapshot()]);
  const activeResources = getActiveResources();

  const [project, setProject] = useState(activeRows[0]?.project ?? '');
  const [resourceName, setResourceName] = useState(activeResources[0]?.name ?? '');
  const [newLevel, setNewLevel] = useState('SR. MANAGER/DIRECTOR');
  const [effectiveDate, setEffectiveDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [engagementEnd, setEngagementEnd] = useState('2026-12-31');
  const [hoursPerWeek, setHoursPerWeek] = useState(40);

  const resource = useMemo(() => activeResources.find((r) => r.name === resourceName), [resourceName, activeResources]);
  const baseProject = useMemo(() => activeRows.find((r) => r.project === project)!, [project, activeRows]);

  const calc = useMemo(() => {
    if (!resource) return null;
    const oldRate = resource.rate2026;
    const newRate = LEVEL_RATES[newLevel] ?? oldRate;
    const rateDelta = newRate - oldRate;

    const start = new Date(effectiveDate);
    const end = new Date(engagementEnd);
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const weeksRemaining = Math.max(0, Math.round((end.getTime() - start.getTime()) / msPerWeek));

    const hoursRemaining = weeksRemaining * hoursPerWeek;
    const incrementalCost = hoursRemaining * rateDelta;

    return {
      oldRate,
      newRate,
      rateDelta,
      weeksRemaining,
      hoursRemaining,
      incrementalCost,
      newProjectedCushion: baseProject.projectedCushion - incrementalCost,
    };
  }, [resource, newLevel, effectiveDate, engagementEnd, hoursPerWeek, baseProject]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Promotion Impact Calculator</CardTitle>
        <CardDescription>
          Estimates the incremental cost of promoting a resource through engagement end and the resulting Projected Cushion.
          <br />
          <span className="text-xs">Reminder: more negative cushion is favorable.</span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Project</Label>
              <Select value={project} onValueChange={setProject}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {activeRows.map((r) => (
                    <SelectItem key={r.project} value={r.project}>{r.project}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Resource</Label>
              <Select value={resourceName} onValueChange={setResourceName}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {activeResources.map((r) => (
                    <SelectItem key={r.name} value={r.name}>
                      {r.name} <span className="text-muted-foreground ml-1">({r.level})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Current Level</Label>
              <Input value={resource?.level ?? '—'} disabled />
            </div>
            <div>
              <Label className="text-xs">Promote To</Label>
              <Select value={newLevel} onValueChange={setNewLevel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEVELS.map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Effective Date</Label>
              <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Engagement End</Label>
              <Input type="date" value={engagementEnd} onChange={(e) => setEngagementEnd(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Hours per Week</Label>
              <Input type="number" value={hoursPerWeek} onChange={(e) => setHoursPerWeek(Number(e.target.value) || 0)} />
            </div>
            <div>
              <Label className="text-xs">Current Rate / New Rate</Label>
              <div className="h-9 px-3 py-2 rounded-md border bg-muted/20 text-sm tabular-nums flex items-center gap-2">
                <span>${calc?.oldRate ?? 0}/hr</span>
                <span className="text-muted-foreground">→</span>
                <span className="font-semibold">${calc?.newRate ?? 0}/hr</span>
                {calc && calc.rateDelta !== 0 && (
                  <Badge variant={calc.rateDelta > 0 ? 'destructive' : 'secondary'} className="text-[10px] ml-auto">
                    {calc.rateDelta > 0 ? '+' : ''}${calc.rateDelta}/hr
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="p-4 rounded-md border bg-card">
              <div className="text-[10px] uppercase text-muted-foreground">Weeks Remaining</div>
              <div className="text-xl font-bold mt-1">{calc?.weeksRemaining ?? 0}</div>
              <Separator className="my-2" />
              <div className="text-[10px] uppercase text-muted-foreground">Incremental Hours</div>
              <div className="text-xl font-bold mt-1">{calc?.hoursRemaining.toLocaleString() ?? 0}</div>
              <Separator className="my-2" />
              <div className="text-[10px] uppercase text-muted-foreground">Incremental Cost</div>
              <div className={cn('text-xl font-bold mt-1', (calc?.incrementalCost ?? 0) > 0 ? 'text-destructive' : 'text-success')}>
                {fmtMoney(calc?.incrementalCost ?? 0)}
              </div>
            </div>

            <div className="p-4 rounded-md border bg-primary/5">
              <div className="text-[10px] uppercase text-muted-foreground">Cushion Today</div>
              <div className={cn('text-lg font-bold', cushionClass(baseProject.projectedCushion))}>
                {fmtMoney(baseProject.projectedCushion)}
              </div>
              <div className="text-[10px] uppercase text-muted-foreground mt-2">After Promotion</div>
              <div className={cn('text-lg font-bold', cushionClass(calc?.newProjectedCushion ?? 0))}>
                {fmtMoney(calc?.newProjectedCushion ?? 0)}
              </div>
              {calc && Math.abs(calc.incrementalCost) > 1 && (
                <div className="text-xs text-muted-foreground mt-2">
                  Promotion {calc.incrementalCost > 0 ? 'erodes' : 'improves'} cushion by{' '}
                  <span className={cn('font-semibold', calc.incrementalCost > 0 ? 'text-destructive' : 'text-success')}>
                    {fmtMoney(Math.abs(calc.incrementalCost))}
                  </span>
                </div>
              )}
            </div>

            <div className="text-[10px] text-muted-foreground p-2">
              Tip: copy the incremental cost into the Scenario Sandbox's "Promotion Impact" field to layer it with other what-ifs.
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
