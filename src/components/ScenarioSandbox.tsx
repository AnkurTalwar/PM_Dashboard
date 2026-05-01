import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Trash2, Save, FolderOpen } from 'lucide-react';
import { getActiveSummaryRows, type EtcSummaryRow } from '@/lib/etc-summary-data';
import { subscribeWipStore, getWipStoreSnapshot } from '@/lib/wip-store';
import { subscribeForecastCalendarStore, getForecastCalendarStoreSnapshot } from '@/lib/forecast-calendar';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const fmtMoney = (n: number) =>
  n < 0
    ? `(${Math.abs(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })})`
    : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const fmtDelta = (n: number) => {
  if (Math.abs(n) < 1) return '$0';
  const sign = n > 0 ? '+' : '−';
  return `${sign}${Math.abs(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}`;
};

// Reminder: negative cushion = favorable. So a NEGATIVE Δ cushion is good.
const cushionClass = (n: number) => (n < 0 ? 'text-success' : n > 0 ? 'text-destructive' : 'text-muted-foreground');
const deltaCushionClass = (n: number) => (n < 0 ? 'text-success' : n > 0 ? 'text-destructive' : 'text-muted-foreground');

interface ScenarioInputs {
  // Forecast adjustments
  addlForecastHours: number;     // additional engagement hours @ blended rate
  blendedRate: number;            // $/hr applied to addlForecastHours
  forecastReductionPct: number;   // % to reduce remaining forecast (e.g. timeline pulled in)
  // Headcount changes
  addHeadcountLevel: string;
  addHeadcountWeeks: number;
  addHeadcountHoursPerWeek: number;
  // Misc
  promotionImpact: number;        // $ added to promotion impact line
  nonRecovDelta: number;          // $ change to non-recoverable expenses
  reserveRelease: number;         // $ favorable (reduces forecast)
}

const DEFAULT_INPUTS: ScenarioInputs = {
  addlForecastHours: 0,
  blendedRate: 1100,
  forecastReductionPct: 0,
  addHeadcountLevel: '',
  addHeadcountWeeks: 0,
  addHeadcountHoursPerWeek: 40,
  promotionImpact: 0,
  nonRecovDelta: 0,
  reserveRelease: 0,
};

interface SavedScenario {
  id: string;
  name: string;
  project: string;
  inputs: ScenarioInputs;
  savedAt: string;
}

const STORAGE_KEY = 'etc-scenarios-v1';

const levelRates: Record<string, number> = {
  'PARTNER': 1345,
  'SR. MANAGER/DIRECTOR': 1270,
  'MANAGER': 1130,
  'SENIOR ASSOCIATE': 955,
  'ASSOCIATE': 645,
};

function computeProjected(base: EtcSummaryRow, inputs: ScenarioInputs) {
  const addlForecast = inputs.addlForecastHours * inputs.blendedRate;
  const forecastReduction = -base.totalForecast * (inputs.forecastReductionPct / 100);
  const addHeadcountCost =
    inputs.addHeadcountWeeks *
    inputs.addHeadcountHoursPerWeek *
    (levelRates[inputs.addHeadcountLevel] ?? 0);

  const adjForecast = base.totalForecast + addlForecast + forecastReduction + addHeadcountCost;
  const adjNonRecov = base.forecastedNonRecoverableExpenses + inputs.nonRecovDelta;
  const adjPromo = base.promotionImpact + inputs.promotionImpact;

  // Projected Cushion = Cushion Pre-Forecast − Total Forecast − Non-Recov − Promo + Reserve
  // Reserve release REDUCES forecast burden → makes cushion MORE negative (favorable)
  const projected =
    base.cushionBeforeForecast - adjForecast - adjNonRecov - adjPromo - inputs.reserveRelease;

  return {
    adjForecast,
    adjNonRecov,
    adjPromo,
    projected,
    delta: projected - base.projectedCushion,
    components: {
      addlForecast,
      forecastReduction,
      addHeadcountCost,
    },
  };
}

export function ScenarioSandbox() {
  useSyncExternalStore(subscribeWipStore, getWipStoreSnapshot);
  useSyncExternalStore(subscribeForecastCalendarStore, getForecastCalendarStoreSnapshot);
  const activeRows = useMemo(() => getActiveSummaryRows(), [getWipStoreSnapshot()]);

  const [project, setProject] = useState<string>(activeRows[0]?.project ?? '');
  const [inputs, setInputs] = useState<ScenarioInputs>(DEFAULT_INPUTS);
  const [scenarios, setScenarios] = useState<SavedScenario[]>([]);
  const [scenarioName, setScenarioName] = useState('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setScenarios(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  const persist = (next: SavedScenario[]) => {
    setScenarios(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const base = useMemo(() => activeRows.find((r) => r.project === project)!, [project, activeRows]);
  const result = useMemo(() => computeProjected(base, inputs), [base, inputs]);

  const handleSave = () => {
    if (!scenarioName.trim()) {
      toast.error('Give your scenario a name first.');
      return;
    }
    const next: SavedScenario = {
      id: crypto.randomUUID(),
      name: scenarioName.trim(),
      project,
      inputs: { ...inputs },
      savedAt: new Date().toISOString(),
    };
    persist([next, ...scenarios]);
    setScenarioName('');
    toast.success(`Saved "${next.name}"`);
  };

  const handleLoad = (s: SavedScenario) => {
    setProject(s.project);
    setInputs(s.inputs);
    toast.success(`Loaded "${s.name}"`);
  };

  const handleDelete = (id: string) => {
    persist(scenarios.filter((s) => s.id !== id));
  };

  const handleReset = () => setInputs(DEFAULT_INPUTS);

  const update = <K extends keyof ScenarioInputs>(k: K, v: ScenarioInputs[K]) =>
    setInputs((p) => ({ ...p, [k]: v }));

  const projectScenarios = scenarios.filter((s) => s.project === project);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle>Scenario Sandbox — What If?</CardTitle>
            <CardDescription>
              Adjust forecast assumptions and see Projected Cushion update live. Save named scenarios per project (stored in your browser).
              <br />
              <span className="text-xs">Reminder: more negative cushion is favorable.</span>
            </CardDescription>
          </div>
          <Select value={project} onValueChange={setProject}>
            <SelectTrigger className="w-[240px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {activeRows.map((r) => (
                <SelectItem key={r.project} value={r.project}>{r.project}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Inputs */}
          <div className="lg:col-span-2 space-y-6">
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Forecast Adjustments
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="addlHrs" className="text-xs">Additional Forecast Hours</Label>
                  <Input
                    id="addlHrs"
                    type="number"
                    value={inputs.addlForecastHours}
                    onChange={(e) => update('addlForecastHours', Number(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label htmlFor="rate" className="text-xs">Blended Rate ($/hr)</Label>
                  <Input
                    id="rate"
                    type="number"
                    value={inputs.blendedRate}
                    onChange={(e) => update('blendedRate', Number(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label htmlFor="redPct" className="text-xs">Forecast Reduction (%)</Label>
                  <Input
                    id="redPct"
                    type="number"
                    value={inputs.forecastReductionPct}
                    onChange={(e) => update('forecastReductionPct', Number(e.target.value) || 0)}
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Headcount Change
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Add Resource at Level</Label>
                  <Select
                    value={inputs.addHeadcountLevel || 'NONE'}
                    onValueChange={(v) => update('addHeadcountLevel', v === 'NONE' ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">— None —</SelectItem>
                      {Object.keys(levelRates).map((lvl) => (
                        <SelectItem key={lvl} value={lvl}>{lvl} (${levelRates[lvl]}/hr)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="weeks" className="text-xs">Weeks Engaged</Label>
                  <Input
                    id="weeks"
                    type="number"
                    value={inputs.addHeadcountWeeks}
                    onChange={(e) => update('addHeadcountWeeks', Number(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label htmlFor="hpw" className="text-xs">Hours / Week</Label>
                  <Input
                    id="hpw"
                    type="number"
                    value={inputs.addHeadcountHoursPerWeek}
                    onChange={(e) => update('addHeadcountHoursPerWeek', Number(e.target.value) || 0)}
                  />
                </div>
              </div>
              {inputs.addHeadcountLevel && inputs.addHeadcountWeeks > 0 && (
                <div className="text-xs text-muted-foreground mt-2">
                  Adds {fmtMoney(result.components.addHeadcountCost)} to forecast
                </div>
              )}
            </div>

            <Separator />

            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Other Adjustments
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="promo" className="text-xs">Promotion Impact ($)</Label>
                  <Input
                    id="promo"
                    type="number"
                    value={inputs.promotionImpact}
                    onChange={(e) => update('promotionImpact', Number(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label htmlFor="nonrec" className="text-xs">Non-Recov Δ ($)</Label>
                  <Input
                    id="nonrec"
                    type="number"
                    value={inputs.nonRecovDelta}
                    onChange={(e) => update('nonRecovDelta', Number(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label htmlFor="reserve" className="text-xs">Reserve Release ($)</Label>
                  <Input
                    id="reserve"
                    type="number"
                    value={inputs.reserveRelease}
                    onChange={(e) => update('reserveRelease', Number(e.target.value) || 0)}
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div className="flex items-end gap-2 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <Label htmlFor="scname" className="text-xs">Scenario Name</Label>
                <Input
                  id="scname"
                  placeholder='e.g. "Add 2 Sr Mgrs in May"'
                  value={scenarioName}
                  onChange={(e) => setScenarioName(e.target.value)}
                />
              </div>
              <Button onClick={handleSave} size="sm">
                <Save className="h-4 w-4 mr-1" /> Save Scenario
              </Button>
              <Button onClick={handleReset} size="sm" variant="outline">
                Reset Inputs
              </Button>
            </div>
          </div>

          {/* Results panel */}
          <div className="space-y-4">
            <div className="p-4 rounded-md border bg-card">
              <div className="text-[10px] uppercase text-muted-foreground">Baseline Cushion</div>
              <div className={cn('text-2xl font-bold mt-1', cushionClass(base.projectedCushion))}>
                {fmtMoney(base.projectedCushion)}
              </div>
              <Separator className="my-3" />
              <div className="text-[10px] uppercase text-muted-foreground">Scenario Cushion</div>
              <div className={cn('text-2xl font-bold mt-1', cushionClass(result.projected))}>
                {fmtMoney(result.projected)}
              </div>
              <div className={cn('text-sm font-semibold mt-2 tabular-nums', deltaCushionClass(result.delta))}>
                Δ {fmtDelta(result.delta)}
                <span className="text-[10px] text-muted-foreground ml-2">
                  {result.delta < 0 ? 'favorable' : result.delta > 0 ? 'unfavorable' : 'flat'}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-md border bg-muted/20 text-xs space-y-1">
              <div className="font-semibold uppercase text-[10px] text-muted-foreground mb-2">
                Adjusted Components
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cushion Pre-Forecast</span>
                <span className="tabular-nums">{fmtMoney(base.cushionBeforeForecast)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Forecast (adj)</span>
                <span className="tabular-nums">{fmtMoney(result.adjForecast)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Non-Recov (adj)</span>
                <span className="tabular-nums">{fmtMoney(result.adjNonRecov)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Promo Impact (adj)</span>
                <span className="tabular-nums">{fmtMoney(result.adjPromo)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reserve Release</span>
                <span className="tabular-nums">{fmtMoney(inputs.reserveRelease)}</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Saved Scenarios — {project}
                </h4>
                <Badge variant="outline" className="text-[10px]">{projectScenarios.length}</Badge>
              </div>
              {projectScenarios.length === 0 ? (
                <div className="text-xs text-muted-foreground p-3 border rounded-md bg-muted/10">
                  No scenarios saved for this project yet.
                </div>
              ) : (
                <div className="space-y-1">
                  {projectScenarios.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 p-2 rounded border bg-card">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{s.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {new Date(s.savedAt).toLocaleString()}
                        </div>
                      </div>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleLoad(s)}>
                        <FolderOpen className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDelete(s.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
