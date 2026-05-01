import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine, PieChart, Pie, Cell } from 'recharts';
import { ChevronDown, DollarSign, AlertTriangle, CheckCircle, Upload } from 'lucide-react';
import { KpiCard } from '@/components/KpiCard';
import { ProjectFilterBadge } from '@/components/ProjectFilterBadge';
import { Fragment, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  getActiveExpenseCompliancePolicy,
  getActiveExpenseComplianceSummary,
  getProgramPackageStoreSnapshot,
  subscribeProgramPackageStore,
} from '@/lib/program-package';
import { evaluateExpenseRules, LEGACY_EXPENSE_RULE_IDS } from '@/lib/expense-compliance';
import { 
  getExpenseComplianceFromExcel, 
  hasExpenseComplianceData,
  getCustomPolicyLimits,
  setCustomPolicyLimits,
  resetPolicyLimits,
  subscribePolicyLimits,
  type CustomPolicyLimits
} from '@/lib/expense-compliance-adapter';
import { 
  subscribeExcelExpenseStore, 
  getExcelExpenseStoreSnapshot 
} from '@/lib/excel-expense-store';

const chartConfig = {
  meals: { label: 'Meals', color: 'hsl(var(--chart-1))' },
  lodging: { label: 'Lodging', color: 'hsl(var(--chart-2))' },
  airfare: { label: 'Airfare', color: 'hsl(var(--chart-3))' },
  ground: { label: 'Ground', color: 'hsl(var(--chart-4))' },
  other: { label: 'Other', color: 'hsl(var(--chart-5))' },
};

const COLORS = ['hsl(221,83%,53%)', 'hsl(142,71%,45%)', 'hsl(38,92%,50%)', 'hsl(280,67%,60%)', 'hsl(0,84%,60%)'];

const STATE_NAME_BY_CODE: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan',
  MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
  TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin',
  WY: 'Wyoming', DC: 'District of Columbia',
};

const STATE_CODE_BY_NAME = Object.fromEntries(
  Object.entries(STATE_NAME_BY_CODE).map(([code, name]) => [name.toLowerCase(), code]),
);

type LocationFilterOption = {
  id: string;
  state: string;
  city: string;
};

type ResourceActivityFilter = 'active' | 'inactive' | 'all';

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeStateName(value: string) {
  const cleaned = value.replace(/\./g, '').trim();
  if (!cleaned) return 'Unknown';

  const upper = cleaned.toUpperCase();
  if (STATE_NAME_BY_CODE[upper]) return STATE_NAME_BY_CODE[upper];

  const normalizedName = cleaned.toLowerCase();
  if (STATE_CODE_BY_NAME[normalizedName]) {
    return STATE_NAME_BY_CODE[STATE_CODE_BY_NAME[normalizedName]];
  }

  return toTitleCase(cleaned);
}

function parseLocationOption(location: string): LocationFilterOption {
  const cleaned = location.trim() || 'Unknown';
  const parts = cleaned.split(',').map((part) => part.trim()).filter(Boolean);

  if (parts.length >= 2) {
    return {
      id: cleaned,
      state: normalizeStateName(parts[parts.length - 1]),
      city: parts.slice(0, -1).join(', ') || cleaned,
    };
  }

  const trailingStateMatch = cleaned.match(/^(.*?)[,\s]+([A-Za-z]{2})$/);
  if (trailingStateMatch) {
    return {
      id: cleaned,
      state: normalizeStateName(trailingStateMatch[2]),
      city: trailingStateMatch[1].trim() || cleaned,
    };
  }

  return {
    id: cleaned,
    state: 'Unknown',
    city: cleaned,
  };
}

export default function ExpenseCompliance() {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [expandedWeekKey, setExpandedWeekKey] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [resourceActivityFilter, setResourceActivityFilter] = useState<ResourceActivityFilter>('active');
  
  // Custom policy limits state
  const [customLimits, setCustomLimitsState] = useState<CustomPolicyLimits>(getCustomPolicyLimits());
  const [isEditingLimits, setIsEditingLimits] = useState(false);
  
  // Subscribe to policy changes
  useEffect(() => {
    const unsubscribe = subscribePolicyLimits(() => {
      setCustomLimitsState(getCustomPolicyLimits());
    });
    return unsubscribe;
  }, []);
  
  // Subscribe to both data sources
  useSyncExternalStore(subscribeProgramPackageStore, getProgramPackageStoreSnapshot);
  useSyncExternalStore(subscribeExcelExpenseStore, getExcelExpenseStoreSnapshot);

  // Get data: Excel first, then program package (recalculate when customLimits change)
  const excelExpenseData = useMemo(
    () => getExpenseComplianceFromExcel(customLimits),
    [customLimits]
  );
  const packageData = getActiveExpenseComplianceSummary();
  const expenseData = excelExpenseData.length > 0 ? excelExpenseData : packageData;
  const dataSource = excelExpenseData.length > 0 ? 'excel' : packageData.length > 0 ? 'package' : 'none';
  
  // Create dynamic expense policy that reflects current custom limits for display
  const expensePolicy = useMemo(() => {
    const basePolicy = getActiveExpenseCompliancePolicy();
    return {
      ...basePolicy,
      rules: [
        {
          id: LEGACY_EXPENSE_RULE_IDS.meals,
          name: 'Meals Daily Limit',
          frequency: 'daily' as const,
          limit: customLimits.mealsPerDay,
          expenseTypes: ['Meals' as const],
          detail: 'Maximum reimbursable meals per day',
        },
        {
          id: LEGACY_EXPENSE_RULE_IDS.lodging,
          name: 'Lodging Daily Limit',
          frequency: 'daily' as const,
          limit: customLimits.lodgingPerNight,
          expenseTypes: ['Lodging' as const],
          detail: 'Maximum reimbursable lodging per night',
        },
        {
          id: LEGACY_EXPENSE_RULE_IDS.weekly,
          name: 'Weekly Non-Airfare Limit',
          frequency: 'weekly' as const,
          limit: customLimits.weeklyNonAirfare,
          expenseTypes: ['Meals' as const, 'Lodging' as const, 'Airfare' as const, 'Ground Transport' as const, 'Other' as const],
          excludeExpenseTypes: ['Airfare' as const],
          detail: 'Maximum weekly spend excluding airfare',
        },
      ]
    };
  }, [customLimits]);
  
  const mealRule = expensePolicy.rules.find((rule) => rule.id === LEGACY_EXPENSE_RULE_IDS.meals);
  const lodgingRule = expensePolicy.rules.find((rule) => rule.id === LEGACY_EXPENSE_RULE_IDS.lodging);
  const primaryWeeklyRule = expensePolicy.rules.find((rule) => rule.frequency === 'weekly');
  const ruleNameById = useMemo(
    () => Object.fromEntries(expensePolicy.rules.map((rule) => [rule.id, rule.name])),
    [expensePolicy.rules],
  );

  const dateBounds = useMemo(() => {
    const allDates = expenseData.flatMap((e) => e.expenseEntries.map((entry) => entry.date));
    const sorted = Array.from(new Set(allDates)).sort((a, b) => a.localeCompare(b));
    return {
      min: sorted[0] ?? '',
      max: sorted[sorted.length - 1] ?? '',
    };
  }, [expenseData]);

  useEffect(() => {
    setStartDate(dateBounds.min);
    setEndDate(dateBounds.max);
  }, [dateBounds.min, dateBounds.max]);

  const locationOptions = useMemo(() => {
    const uniqueLocations = Array.from(
      new Set(expenseData.flatMap((employee) => employee.expenseEntries.map((entry) => entry.location)).filter(Boolean)),
    );

    return uniqueLocations
      .map(parseLocationOption)
      .sort((a, b) => a.state.localeCompare(b.state) || a.city.localeCompare(b.city));
  }, [expenseData]);

  const availableStates = useMemo(() => {
    return Array.from(new Set(locationOptions.map((option) => option.state))).sort((a, b) => a.localeCompare(b));
  }, [locationOptions]);

  const availableCities = useMemo(() => {
    return locationOptions.filter((option) => selectedStates.includes(option.state));
  }, [locationOptions, selectedStates]);

  useEffect(() => {
    setSelectedStates(availableStates);
    setSelectedCities(locationOptions.map((option) => option.id));
  }, [availableStates, locationOptions]);

  const toggleState = (state: string, checked: boolean) => {
    const nextStates = checked
      ? selectedStates.includes(state)
        ? selectedStates
        : [...selectedStates, state]
      : selectedStates.filter((value) => value !== state);

    setSelectedStates(nextStates);
    setSelectedCities((current) => {
      const visibleIds = locationOptions
        .filter((option) => nextStates.includes(option.state))
        .map((option) => option.id);

      if (!checked) return current.filter((id) => visibleIds.includes(id));

      const nextSelected = new Set(current.filter((id) => visibleIds.includes(id)));
      for (const option of locationOptions) {
        if (option.state === state) nextSelected.add(option.id);
      }
      return visibleIds.filter((id) => nextSelected.has(id));
    });
  };

  const toggleCity = (cityId: string, checked: boolean) => {
    setSelectedCities((current) => {
      if (checked) return current.includes(cityId) ? current : [...current, cityId];
      return current.filter((value) => value !== cityId);
    });
  };

  const selectAllStates = () => {
    setSelectedStates(availableStates);
    setSelectedCities(locationOptions.map((option) => option.id));
  };

  const clearAllStates = () => {
    setSelectedStates([]);
    setSelectedCities([]);
  };

  const selectAllCities = () => {
    setSelectedCities(availableCities.map((option) => option.id));
  };

  const clearAllCities = () => {
    setSelectedCities([]);
  };

  const filteredExpenseData = useMemo(() => {
    const effectiveStart = startDate || dateBounds.min;
    const effectiveEnd = endDate || dateBounds.max;
    const monthKeys: string[] = [];

    if (effectiveStart && effectiveEnd) {
      const cursor = new Date(`${effectiveStart}T00:00:00`);
      cursor.setUTCDate(1);
      const endCursor = new Date(`${effectiveEnd}T00:00:00`);
      endCursor.setUTCDate(1);

      while (cursor <= endCursor) {
        monthKeys.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      }
    }

    return expenseData
      .map((employee) => {
        const expenseEntries = employee.expenseEntries.filter((entry) => {
          if (effectiveStart && entry.date < effectiveStart) return false;
          if (effectiveEnd && entry.date > effectiveEnd) return false;
          const parsedLocation = parseLocationOption(entry.location);
          if (!selectedStates.includes(parsedLocation.state)) return false;
          if (!selectedCities.includes(parsedLocation.id)) return false;
          return true;
        });
        const ruleResults = evaluateExpenseRules(expenseEntries, expensePolicy);

        const weeklyMap = new Map<string, { meals: number; lodging: number; airfare: number; ground: number; other: number }>();
        for (const entry of expenseEntries) {
          if (!weeklyMap.has(entry.weekEnding)) {
            weeklyMap.set(entry.weekEnding, { meals: 0, lodging: 0, airfare: 0, ground: 0, other: 0 });
          }
          const week = weeklyMap.get(entry.weekEnding)!;
          if (entry.category === 'Meals') week.meals += entry.amount;
          else if (entry.category === 'Lodging') week.lodging += entry.amount;
          else if (entry.category === 'Airfare') week.airfare += entry.amount;
          else if (entry.category === 'Ground Transport') week.ground += entry.amount;
          else week.other += entry.amount;
        }

        const weeklyBreakdown = Array.from(weeklyMap.entries())
          .map(([weekEnding, values]) => {
            const total = values.meals + values.lodging + values.airfare + values.ground + values.other;
            return {
              weekEnding,
              total,
              meals: values.meals,
              lodging: values.lodging,
              airfare: values.airfare,
              ground: values.ground,
              other: values.other,
              hasViolation: ruleResults.violationWeeks.has(weekEnding),
            };
          })
          .sort((a, b) => a.weekEnding.localeCompare(b.weekEnding));

        const monthCounts = new Map<string, number>();
        for (const monthKey of monthKeys) monthCounts.set(monthKey, 0);
        for (const entry of expenseEntries) {
          const entryDate = new Date(`${entry.date}T00:00:00`);
          const monthKey = `${entryDate.getUTCFullYear()}-${String(entryDate.getUTCMonth() + 1).padStart(2, '0')}`;
          monthCounts.set(monthKey, (monthCounts.get(monthKey) ?? 0) + 1);
        }

        let trailingInactiveMonths = 0;
        for (let index = monthKeys.length - 1; index >= 0; index -= 1) {
          if ((monthCounts.get(monthKeys[index]) ?? 0) > 0) break;
          trailingInactiveMonths += 1;
        }

        const activityStatus = trailingInactiveMonths >= 2 ? 'inactive' : 'active';

        return {
          ...employee,
          expenseEntries,
          ruleResults,
          weeklyBreakdown,
          totalExpenses: weeklyBreakdown.reduce((sum, week) => sum + week.total, 0),
          violationCount: ruleResults.violationCount,
          mealViolations: ruleResults.violationsByRule[LEGACY_EXPENSE_RULE_IDS.meals] ?? 0,
          lodgingViolations: ruleResults.violationsByRule[LEGACY_EXPENSE_RULE_IDS.lodging] ?? 0,
          weeklyViolations: ruleResults.violationsByRule[LEGACY_EXPENSE_RULE_IDS.weekly] ?? 0,
          activityStatus,
        };
      })
      .filter((employee) => employee.expenseEntries.length > 0)
      .filter((employee) => {
        if (resourceActivityFilter === 'all') return true;
        return employee.activityStatus === resourceActivityFilter;
      });
  }, [expenseData, startDate, endDate, dateBounds.min, dateBounds.max, selectedStates, selectedCities, resourceActivityFilter, expensePolicy]);

  const categoryTotals = useMemo(
    () => filteredExpenseData.reduce(
      (acc, e) => {
        e.weeklyBreakdown.forEach((w) => {
          acc[0].value += w.meals;
          acc[1].value += w.lodging;
          acc[2].value += w.airfare;
          acc[3].value += w.ground;
          acc[4].value += w.other;
        });
        return acc;
      },
      [
        { name: 'Meals', value: 0 },
        { name: 'Lodging', value: 0 },
        { name: 'Airfare', value: 0 },
        { name: 'Ground', value: 0 },
        { name: 'Other', value: 0 },
      ],
    ),
    [filteredExpenseData],
  );

  const totalViolations = filteredExpenseData.reduce((s, e) => s + e.violationCount, 0);
  const compliantCount = filteredExpenseData.filter((e) => e.violationCount === 0).length;
  const totalExpenses = filteredExpenseData.reduce((s, e) => s + e.totalExpenses, 0);

  const weeklyTrend = useMemo(() => {
    const weekMap = new Map<string, number>();
    for (const employee of filteredExpenseData) {
      for (const week of employee.weeklyBreakdown) {
        weekMap.set(week.weekEnding, (weekMap.get(week.weekEnding) ?? 0) + week.total);
      }
    }

    return Array.from(weekMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([weekEnding, total]) => ({
        week: weekEnding.slice(5),
        total,
      }));
  }, [filteredExpenseData]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Expense Compliance</h1>
        <p className="text-muted-foreground mt-1">
          Policy checks: {expensePolicy.rules.map((rule) => `${rule.name} (${rule.frequency}, $${rule.limit.toLocaleString()})`).join(' | ')}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {expensePolicy.rules.map((rule) => `${rule.name}: ${rule.detail || 'No additional detail provided'}`).join(' | ')}
        </p>
      </div>
      
      {/* Policy Thresholds Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Policy Thresholds</span>
            <div className="flex gap-2">
              {isEditingLimits ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setCustomLimitsState(getCustomPolicyLimits());
                      setIsEditingLimits(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setCustomPolicyLimits(customLimits);
                      setIsEditingLimits(false);
                    }}
                  >
                    Apply Changes
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      resetPolicyLimits();
                      setCustomLimitsState(getCustomPolicyLimits());
                    }}
                  >
                    Reset to Defaults
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setIsEditingLimits(true)}
                  >
                    Edit Thresholds
                  </Button>
                </>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Meals Daily Limit</label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">$</span>
                <Input
                  type="number"
                  value={customLimits.mealsPerDay}
                  onChange={(e) => setCustomLimitsState({
                    ...customLimits,
                    mealsPerDay: Math.max(0, parseInt(e.target.value) || 0)
                  })}
                  disabled={!isEditingLimits}
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">per day</span>
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Lodging Daily Limit</label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">$</span>
                <Input
                  type="number"
                  value={customLimits.lodgingPerNight}
                  onChange={(e) => setCustomLimitsState({
                    ...customLimits,
                    lodgingPerNight: Math.max(0, parseInt(e.target.value) || 0)
                  })}
                  disabled={!isEditingLimits}
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">per night</span>
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Weekly Non-Airfare Limit</label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">$</span>
                <Input
                  type="number"
                  value={customLimits.weeklyNonAirfare}
                  onChange={(e) => setCustomLimitsState({
                    ...customLimits,
                    weeklyNonAirfare: Math.max(0, parseInt(e.target.value) || 0)
                  })}
                  disabled={!isEditingLimits}
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">per week</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {dataSource === 'none' && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium">No expense data available</p>
            <p className="text-xs text-muted-foreground mt-1">
              Upload an Excel expense file (Data Import page) or load a program package to view expense compliance data.
            </p>
          </CardContent>
        </Card>
      )}
      
      {dataSource !== 'none' && (
        <>
      <ProjectFilterBadge />

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
            <div>
              <label className="text-xs text-muted-foreground">Start date</label>
              <Input type="date" value={startDate} min={dateBounds.min} max={endDate || dateBounds.max} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">End date</label>
              <Input type="date" value={endDate} min={startDate || dateBounds.min} max={dateBounds.max} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Resources</label>
              <Select value={resourceActivityFilter} onValueChange={(value) => setResourceActivityFilter(value as ResourceActivityFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter resources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active only</SelectItem>
                  <SelectItem value="inactive">Inactive only</SelectItem>
                  <SelectItem value="all">All resources</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">States</label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    <span className="truncate">
                      {selectedStates.length === 0
                        ? 'No states'
                        : selectedStates.length === availableStates.length
                          ? 'All states'
                          : `${selectedStates.length} selected`}
                    </span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-64 max-h-80 overflow-auto" align="start">
                  <DropdownMenuLabel>Filter states</DropdownMenuLabel>
                  <div className="flex items-center justify-between gap-2 px-2 pb-2">
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={selectAllStates}>
                      Select all
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearAllStates}>
                      Clear all
                    </Button>
                  </div>
                  <DropdownMenuSeparator />
                  {availableStates.map((state) => (
                    <DropdownMenuCheckboxItem
                      key={state}
                      checked={selectedStates.includes(state)}
                      onCheckedChange={(checked) => toggleState(state, checked === true)}
                      onSelect={(event) => event.preventDefault()}
                    >
                      {state}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Cities</label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    <span className="truncate">
                      {availableCities.length === 0
                        ? 'No cities'
                        : selectedCities.length === availableCities.length
                          ? 'All cities'
                          : `${selectedCities.length} selected`}
                    </span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-72 max-h-80 overflow-auto" align="start">
                  <DropdownMenuLabel>Refine cities</DropdownMenuLabel>
                  <div className="flex items-center justify-between gap-2 px-2 pb-2">
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={selectAllCities}>
                      Select all
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearAllCities}>
                      Clear all
                    </Button>
                  </div>
                  <DropdownMenuSeparator />
                  {availableCities.map((option) => (
                    <DropdownMenuCheckboxItem
                      key={option.id}
                      checked={selectedCities.includes(option.id)}
                      onCheckedChange={(checked) => toggleCity(option.id, checked === true)}
                      onSelect={(event) => event.preventDefault()}
                    >
                      {option.city}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="text-xs text-muted-foreground">
              Showing {startDate || dateBounds.min || '—'} to {endDate || dateBounds.max || '—'}
              <br />
              {resourceActivityFilter === 'all' ? 'All resources' : resourceActivityFilter === 'active' ? 'Active only' : 'Inactive only'}
              <br />
              {selectedStates.length === availableStates.length ? 'All states' : `${selectedStates.length} states selected`}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard title="Total Expenses" value={`$${totalExpenses.toLocaleString()}`} icon={DollarSign} />
        <KpiCard title="Total Violations" value={totalViolations} icon={AlertTriangle} trend={totalViolations > 0 ? 'negative' : 'positive'} />
        <KpiCard title="Compliant Employees" value={compliantCount} icon={CheckCircle} trend="positive" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Weekly Expense Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px]">
              <BarChart data={weeklyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                {primaryWeeklyRule && (
                  <ReferenceLine y={primaryWeeklyRule.limit * filteredExpenseData.length} stroke="hsl(var(--destructive))" strokeDasharray="5 5" />
                )}
                <Bar dataKey="total" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By Category</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px]">
              <PieChart>
                <Pie data={categoryTotals} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100}>
                  {categoryTotals.map((_, i) => (
                    <Cell key={i} fill={COLORS[i]} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
              </PieChart>
            </ChartContainer>
            <div className="flex flex-wrap gap-3 mt-2 justify-center">
              {categoryTotals.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1.5 text-xs">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                  <span className="text-muted-foreground">{d.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Employee Compliance</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Total Expenses</TableHead>
                <TableHead className="text-center">Violations</TableHead>
                <TableHead className="text-center">Meal</TableHead>
                <TableHead className="text-center">Lodging</TableHead>
                <TableHead className="text-center">Weekly</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredExpenseData.map((e) => (
                <Fragment key={e.employeeName}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => {
                      const next = expandedRow === e.employeeName ? null : e.employeeName;
                      setExpandedRow(next);
                      setExpandedWeekKey(null);
                    }}
                  >
                    <TableCell className="font-medium">{e.employeeName}</TableCell>
                    <TableCell className="text-right">${e.totalExpenses.toLocaleString()}</TableCell>
                    <TableCell className="text-center">{e.violationCount}</TableCell>
                    <TableCell className="text-center">{e.mealViolations}</TableCell>
                    <TableCell className="text-center">{e.lodgingViolations}</TableCell>
                    <TableCell className="text-center">{e.weeklyViolations}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={e.violationCount > 0 ? 'destructive' : 'secondary'}>
                        {e.violationCount > 0 ? 'Non-Compliant' : 'Compliant'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                  {expandedRow === e.employeeName && (
                    <TableRow>
                      <TableCell colSpan={7} className="bg-muted/50 p-0">
                        <div className="p-4">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Week Ending</TableHead>
                                <TableHead className="text-right">Meals</TableHead>
                                <TableHead className="text-right">Lodging</TableHead>
                                <TableHead className="text-right">Airfare</TableHead>
                                <TableHead className="text-right">Ground</TableHead>
                                <TableHead className="text-right">Other</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead>Triggered Checks</TableHead>
                                <TableHead className="text-center">Flag</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {e.weeklyBreakdown.map((w) => (
                                <Fragment key={w.weekEnding}>
                                <TableRow
                                  className={w.hasViolation ? 'cursor-pointer hover:bg-muted/40' : ''}
                                  onClick={() => {
                                    if (!w.hasViolation) return;
                                    const key = `${e.employeeName}::${w.weekEnding}`;
                                    setExpandedWeekKey(expandedWeekKey === key ? null : key);
                                  }}
                                >
                                  <TableCell>{w.weekEnding}</TableCell>
                                  <TableCell className={`text-right ${mealRule && w.meals > mealRule.limit ? 'text-destructive font-medium' : ''}`}>
                                    ${w.meals}
                                  </TableCell>
                                  <TableCell className={`text-right ${lodgingRule && w.lodging > lodgingRule.limit ? 'text-destructive font-medium' : ''}`}>
                                    ${w.lodging}
                                  </TableCell>
                                  <TableCell className="text-right">${w.airfare}</TableCell>
                                  <TableCell className="text-right">${w.ground}</TableCell>
                                  <TableCell className="text-right">${w.other}</TableCell>
                                  <TableCell className="text-right font-medium">${w.total}</TableCell>
                                  <TableCell>
                                    {w.hasViolation ? (
                                      <div className="flex flex-wrap gap-1">
                                        {(e.ruleResults.weekRuleHits[w.weekEnding] ?? []).map((ruleId) => (
                                          <Badge key={ruleId} variant="outline" className="text-[10px] px-1.5 py-0.5">
                                            {ruleNameById[ruleId] ?? ruleId}
                                          </Badge>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">No issues</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {w.hasViolation && <AlertTriangle className="h-4 w-4 text-destructive inline" />}
                                  </TableCell>
                                </TableRow>
                                {expandedWeekKey === `${e.employeeName}::${w.weekEnding}` && (
                                  <TableRow>
                                    <TableCell colSpan={9} className="bg-background/60">
                                      <div className="space-y-2 py-2">
                                        <div className="text-xs font-medium text-muted-foreground">Violating Transactions</div>
                                        {e.ruleResults.transactionViolations.filter((v) => v.weekEnding === w.weekEnding).length === 0 ? (
                                          <div className="text-xs text-muted-foreground">
                                            No transaction-level violations for this week. This week is flagged by aggregate daily/weekly checks.
                                          </div>
                                        ) : (
                                          <Table>
                                            <TableHeader>
                                              <TableRow>
                                                <TableHead>Date</TableHead>
                                                <TableHead>Category</TableHead>
                                                <TableHead>Location</TableHead>
                                                <TableHead className="text-right">Amount</TableHead>
                                                <TableHead>Rule</TableHead>
                                              </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                              {e.ruleResults.transactionViolations
                                                .filter((v) => v.weekEnding === w.weekEnding)
                                                .map((v, idx) => (
                                                  <TableRow key={`${v.date}-${v.category}-${v.amount}-${idx}`}>
                                                    <TableCell>{v.date}</TableCell>
                                                    <TableCell>{v.category}</TableCell>
                                                    <TableCell>{v.location}</TableCell>
                                                    <TableCell className="text-right font-medium">${v.amount.toFixed(2)}</TableCell>
                                                    <TableCell>
                                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
                                                        {ruleNameById[v.ruleId] ?? v.ruleId}
                                                      </Badge>
                                                    </TableCell>
                                                  </TableRow>
                                                ))}
                                            </TableBody>
                                          </Table>
                                        )}
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                )}
                                </Fragment>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      </>
      )}
    </div>
  );
}
