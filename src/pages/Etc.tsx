import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  TrendingUp,
  Users,
  Briefcase,
  Hash,
  Calendar,
  ChevronDown,
} from 'lucide-react';
import { KpiCard } from '@/components/KpiCard';
import { EtcSummaryTable } from '@/components/EtcSummaryTable';
import { CushionWaterfall } from '@/components/CushionWaterfall';
import { ProjectFilterBadge } from '@/components/ProjectFilterBadge';
import {
  useResourcesLookup,
  useProjectsLookup,
  useForecastLookup,
} from '@/lib/etc-lookups';
import {
  getActiveEngagementCodes,
  getActiveFyConfig,
  getActiveWeekEndings,
  getActiveProjects,
  subscribeProgramPackageStore,
  getProgramPackageStoreSnapshot,
} from '@/lib/program-package';
import { getActivePriorWipReference, getActiveSummaryRows, getActiveWipReference } from '@/lib/etc-summary-data';
import { getWipHistory, setWipComparisonSelection, subscribeWipStore, getWipStoreSnapshot } from '@/lib/wip-store';
import { getRemainingEngagementForecastBreakdownByProject } from '@/lib/forecast-calendar';
import {
  getPtoCalendarStoreSnapshot,
  subscribePtoCalendarStore,
} from '@/lib/pto-calendar';

const fmtMoney = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export default function Etc() {
  useSyncExternalStore(subscribeProgramPackageStore, getProgramPackageStoreSnapshot);
  const ptoState = useSyncExternalStore(subscribePtoCalendarStore, getPtoCalendarStoreSnapshot);
  const wipState = useSyncExternalStore(subscribeWipStore, getWipStoreSnapshot);

  const resources = useResourcesLookup();
  const projects = useProjectsLookup();
  const forecast = useForecastLookup();
  const weekEndings = getActiveWeekEndings();
  const fyConfig = getActiveFyConfig();
  const activeCodes = getActiveEngagementCodes();

  // ---- Filter state ----
  const [statusFilter, setStatusFilter] = useState<'all' | 'Open' | 'Closed'>('all');
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [showWoW, setShowWoW] = useState(true);

  const allProjectRows = useMemo(() => getActiveSummaryRows(), [wipState.current?.id]);

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

  const allProjectNames = useMemo(() => allProjectRows.map((r) => r.project), [allProjectRows]);

  // Initialize/reset selection when available projects change
  useEffect(() => {
    setSelectedProjects(allProjectNames);
  }, [allProjectNames.join(',')]);

  const toggleProject = (name: string, checked: boolean) => {
    setSelectedProjects((prev) =>
      checked ? (prev.includes(name) ? prev : [...prev, name]) : prev.filter((p) => p !== name),
    );
  };

  const filteredProjects = useMemo(() => {
    return allProjectNames.filter((name) => {
      if (!selectedProjects.includes(name)) return false;
      if (statusFilter === 'all') return true;
      const status = statusByProject[name] ?? 'Open';
      return status === statusFilter;
    });
  }, [allProjectNames, selectedProjects, statusFilter, statusByProject]);

  const wipRef = getActiveWipReference();
  const priorWipRef = getActivePriorWipReference();
  const wipHistory = getWipHistory();
  const currentId = wipState.current?.id ?? '';
  const priorId = wipState.prior?.id ?? 'none';

  const handleCurrentChange = (nextCurrentId: string) => {
    const nextPriorId = wipState.prior?.id === nextCurrentId
      ? (wipHistory.find((s) => s.id !== nextCurrentId)?.id ?? null)
      : (wipState.prior?.id ?? null);
    setWipComparisonSelection(nextCurrentId, nextPriorId);
  };

  const handlePriorChange = (nextPriorId: string) => {
    if (!currentId) return;
    setWipComparisonSelection(currentId, nextPriorId === 'none' ? null : nextPriorId);
  };

  const totalSowFees = useMemo(
    () => projects.rows.reduce((s, r) => s + (r.data.originalSOW ?? 0), 0),
    [projects.rows],
  );
  const activeProjects = useMemo(
    () => projects.rows.filter((r) => r.data.status && r.data.status.toLowerCase() !== 'completed').length,
    [projects.rows],
  );
  const totalForecastHours = useMemo(
    () => forecast.rows.reduce((s, r) => s + (r.data.totalForecastHours ?? 0), 0),
    [forecast.rows],
  );
  const reconciliation = useMemo(() => {
    const asOfDate = new Date();
    const projectNames = new Set(projects.rows.map((r) => r.data.name));

    let rawHours = 0;
    let ptoHours = 0;
    let netHours = 0;
    let rawValue = 0;
    let ptoValue = 0;
    let netValue = 0;

    for (const project of projectNames) {
      const breakdown = getRemainingEngagementForecastBreakdownByProject(project, asOfDate);
      if (!breakdown) continue;
      rawHours += breakdown.rawHours;
      ptoHours += breakdown.ptoHours;
      netHours += breakdown.netHours;
      rawValue += breakdown.rawValue;
      ptoValue += breakdown.ptoValue;
      netValue += breakdown.netValue;
    }

    return { rawHours, ptoHours, netHours, rawValue, ptoValue, netValue };
  }, [projects.rows, ptoState.current?.id]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <TrendingUp className="h-8 w-8 text-primary" />
          Estimate to Complete
        </h1>
        <p className="text-muted-foreground mt-1">
          Project walkforward and cushion movement analysis
        </p>
      </div>
      <ProjectFilterBadge />

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div>
              <label className="text-xs text-muted-foreground">Main WIP</label>
              <Select value={currentId} onValueChange={handleCurrentChange} disabled={wipHistory.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder="Select current" />
                </SelectTrigger>
                <SelectContent>
                  {wipHistory.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Prior WIP</label>
              <Select value={priorId} onValueChange={handlePriorChange} disabled={!currentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select prior" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {wipHistory
                    .filter((s) => s.id !== currentId)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center h-10 gap-2 px-1">
              <Switch id="etc-wow-toggle" checked={showWoW} onCheckedChange={setShowWoW} />
              <Label htmlFor="etc-wow-toggle" className="text-sm cursor-pointer">Show WoW Δ</Label>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Status</label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | 'Open' | 'Closed')}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="Open">Open</SelectItem>
                  <SelectItem value="Closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Projects</label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    <span className="truncate">
                      {selectedProjects.length === 0
                        ? 'No projects'
                        : selectedProjects.length === allProjectNames.length
                          ? 'All projects'
                          : `${selectedProjects.length} selected`}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-64 max-h-80 overflow-auto" align="start">
                  <DropdownMenuLabel>Filter projects</DropdownMenuLabel>
                  <div className="flex items-center justify-between gap-2 px-2 pb-2">
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setSelectedProjects(allProjectNames)}>
                      Select all
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setSelectedProjects([])}>
                      Clear all
                    </Button>
                  </div>
                  <DropdownMenuSeparator />
                  {allProjectNames.map((name) => (
                    <DropdownMenuCheckboxItem
                      key={name}
                      checked={selectedProjects.includes(name)}
                      onCheckedChange={(checked) => toggleProject(name, checked === true)}
                    >
                      <span className="flex items-center gap-2">
                        {name}
                        <span className={`text-[10px] uppercase font-medium ${(statusByProject[name] ?? 'Open') === 'Open' ? 'text-primary' : 'text-muted-foreground'}`}>
                          {statusByProject[name] ?? 'Open'}
                        </span>
                      </span>
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            WIP comparison: {priorWipRef} → {wipRef}. Showing {filteredProjects.length} of {allProjectNames.length} project{allProjectNames.length !== 1 ? 's' : ''}
          </div>
        </CardContent>
      </Card>

      <EtcSummaryTable
        filterProjects={filteredProjects}
        showWoW={showWoW}
        wipRef={wipRef}
        priorWipRef={priorWipRef}
      />

      <CushionWaterfall filterProjects={filteredProjects} />

      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="advanced" className="border rounded-md px-4">
          <AccordionTrigger className="text-sm font-semibold">Advanced details</AccordionTrigger>
          <AccordionContent className="space-y-6 pb-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <KpiCard title="Resources" value={resources.rows.length} icon={Users} />
              <KpiCard title="Projects" value={projects.rows.length} icon={Briefcase} />
              <KpiCard title="Active Projects" value={activeProjects} icon={Briefcase} />
              <KpiCard title="Engagement Codes" value={activeCodes.length} icon={Hash} />
              <KpiCard title="Forecast Weeks" value={weekEndings.length} icon={Calendar} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <KpiCard title="Total SOW Fees" value={fmtMoney(totalSowFees)} icon={TrendingUp} />
              <KpiCard title="Total Forecast Hours (FY26)" value={totalForecastHours.toLocaleString()} icon={TrendingUp} />
              <KpiCard
                title="Margin Goal / Director"
                value={fmtMoney(fyConfig.marginGoalPerDirector)}
                icon={TrendingUp}
              />
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Forecast Reconciliation (As of Today)</CardTitle>
                <CardDescription>
                  Remaining engagement forecast net of PTO deduction from the active PTO tracker.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div className="rounded border p-3">
                  <div className="text-muted-foreground uppercase text-xs">Raw Forecast</div>
                  <div className="font-semibold mt-1">{fmtMoney(reconciliation.rawValue)}</div>
                </div>
                <div className="rounded border p-3">
                  <div className="text-muted-foreground uppercase text-xs">PTO Deduction</div>
                  <div className="font-semibold mt-1">{fmtMoney(reconciliation.ptoValue)}</div>
                </div>
                <div className="rounded border p-3">
                  <div className="text-muted-foreground uppercase text-xs">Net Forecast</div>
                  <div className="font-semibold mt-1">{fmtMoney(reconciliation.netValue)}</div>
                </div>
                <div className="rounded border p-3">
                  <div className="text-muted-foreground uppercase text-xs">Raw Hours</div>
                  <div className="font-semibold mt-1">{reconciliation.rawHours.toLocaleString(undefined, { maximumFractionDigits: 1 })}</div>
                </div>
                <div className="rounded border p-3">
                  <div className="text-muted-foreground uppercase text-xs">PTO Hours</div>
                  <div className="font-semibold mt-1">{reconciliation.ptoHours.toLocaleString(undefined, { maximumFractionDigits: 1 })}</div>
                </div>
                <div className="rounded border p-3">
                  <div className="text-muted-foreground uppercase text-xs">Net Hours</div>
                  <div className="font-semibold mt-1">{reconciliation.netHours.toLocaleString(undefined, { maximumFractionDigits: 1 })}</div>
                </div>
              </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
