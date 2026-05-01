import { useMemo, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  getPtoCalendarStoreSnapshot,
  subscribePtoCalendarStore,
} from '@/lib/pto-calendar';
import { getRemainingEngagementForecastBreakdownByProject } from '@/lib/forecast-calendar';

const fmtMoney = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

interface ResourceImpactRow {
  project: string;
  resource: string;
  remainingPtoHours: number;
  estimatedValueImpact: number;
}

export function PtoAnalysis() {
  const ptoState = useSyncExternalStore(subscribePtoCalendarStore, getPtoCalendarStoreSnapshot);
  const [searchParams] = useSearchParams();
  const projectFilter = searchParams.get('project');
  const asOfDate = new Date();
  const ptoSnapshot = ptoState.current;

  const summary = useMemo(() => {
    if (!ptoSnapshot) {
      return {
        rows: [] as ResourceImpactRow[],
        plannedHours: 0,
        remainingHours: 0,
        estimatedImpact: 0,
      };
    }

    const keyToHours = new Map<string, number>();
    let plannedHours = 0;
    let remainingHours = 0;

    for (const row of ptoSnapshot.rows) {
      if (projectFilter && row.project !== projectFilter) continue;

      let rowRemainingHours = 0;
      for (let i = 0; i < row.weeklyHours.length; i++) {
        const h = row.weeklyHours[i] ?? 0;
        plannedHours += h;

        const weekEndingIso = ptoSnapshot.weekEndings[i];
        const weekEnding = new Date(`${weekEndingIso}T00:00:00`);
        if (weekEnding > asOfDate) {
          rowRemainingHours += h;
          remainingHours += h;
        }
      }

      if (rowRemainingHours <= 0) continue;
      const key = `${row.project}::${row.resource}`;
      keyToHours.set(key, (keyToHours.get(key) ?? 0) + rowRemainingHours);
    }

    let estimatedImpact = 0;
    const rows: ResourceImpactRow[] = [];

    for (const [key, remainingPtoHours] of keyToHours.entries()) {
      const [project, resource] = key.split('::');
      const breakdown = getRemainingEngagementForecastBreakdownByProject(project, asOfDate);
      const projectRatePerHour =
        breakdown && breakdown.ptoHours > 0 ? breakdown.ptoValue / breakdown.ptoHours : 0;
      const estimatedValueImpact = remainingPtoHours * projectRatePerHour;
      estimatedImpact += estimatedValueImpact;
      rows.push({
        project,
        resource,
        remainingPtoHours,
        estimatedValueImpact,
      });
    }

    rows.sort((a, b) => b.estimatedValueImpact - a.estimatedValueImpact);

    return {
      rows,
      plannedHours,
      remainingHours,
      estimatedImpact,
    };
  }, [asOfDate, projectFilter, ptoSnapshot]);

  if (!ptoSnapshot) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>PTO Analysis</CardTitle>
          <CardDescription>
            Upload PTO data in Data Import to see net forecast impact and resource-level PTO exposure.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">PTO Snapshot Summary</CardTitle>
          <CardDescription>
            Snapshot {ptoSnapshot.label} with proxy valuation based on project-level PTO value per hour.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="rounded border p-3">
            <div className="text-muted-foreground uppercase text-xs">Rows</div>
            <div className="font-semibold mt-1">{ptoSnapshot.rows.length}</div>
          </div>
          <div className="rounded border p-3">
            <div className="text-muted-foreground uppercase text-xs">Planned PTO Hours</div>
            <div className="font-semibold mt-1">{summary.plannedHours.toLocaleString()}</div>
          </div>
          <div className="rounded border p-3">
            <div className="text-muted-foreground uppercase text-xs">Remaining PTO Hours</div>
            <div className="font-semibold mt-1">{summary.remainingHours.toLocaleString()}</div>
          </div>
          <div className="rounded border p-3">
            <div className="text-muted-foreground uppercase text-xs">Estimated Value Impact</div>
            <div className="font-semibold mt-1">{fmtMoney(summary.estimatedImpact)}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resource PTO Impact (Proxy)</CardTitle>
          <CardDescription>
            Estimated impact uses project-level PTO value per hour. Resource rows are directional, not exact booking logic.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-4">Project</th>
                  <th className="py-2 pr-4">Resource</th>
                  <th className="py-2 pr-4 text-right">Remaining PTO Hours</th>
                  <th className="py-2 text-right">Estimated Value Impact</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((row) => (
                  <tr key={`${row.project}-${row.resource}`} className="border-b border-border/50">
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <span>{row.project}</span>
                        <Badge variant="outline" className="text-[10px]">proxy</Badge>
                      </div>
                    </td>
                    <td className="py-2 pr-4">{row.resource}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{row.remainingPtoHours.toFixed(1)}</td>
                    <td className="py-2 text-right tabular-nums">{fmtMoney(row.estimatedValueImpact)}</td>
                  </tr>
                ))}
                {summary.rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-muted-foreground">
                      No remaining PTO hours found for weeks after today.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
