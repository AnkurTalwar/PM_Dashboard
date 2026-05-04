import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine } from 'recharts';
import { ChevronDown, Shield, AlertTriangle, CheckCircle, Upload } from 'lucide-react';
import { KpiCard } from '@/components/KpiCard';
import { ProjectFilterBadge } from '@/components/ProjectFilterBadge';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  getActiveLtaSummary,
  getProgramPackageStoreSnapshot,
  subscribeProgramPackageStore,
} from '@/lib/program-package';
import { getLtaSummaryFromExcel, hasLtaData, getLtaDateRange } from '@/lib/lta-adapter';
import { 
  subscribeExcelExpenseStore, 
  getExcelExpenseStoreSnapshot 
} from '@/lib/excel-expense-store';

const chartConfig = {
  nights: { label: 'Nights', color: 'hsl(var(--chart-1))' },
};

const statusIcon = {
  OK: <CheckCircle className="h-4 w-4 text-success" />,
  WARNING: <AlertTriangle className="h-4 w-4 text-warning" />,
  BREACH: <AlertTriangle className="h-4 w-4 text-destructive" />,
};

const statusVariant = {
  OK: 'secondary' as const,
  WARNING: 'default' as const,
  BREACH: 'destructive' as const,
};

const STATE_NAME_BY_CODE: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
  DC: 'District of Columbia',
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

export default function LtaTracking() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [resourceActivityFilter, setResourceActivityFilter] = useState<ResourceActivityFilter>('active');
  
  // Subscribe to both data sources
  useSyncExternalStore(subscribeProgramPackageStore, getProgramPackageStoreSnapshot);
  useSyncExternalStore(subscribeExcelExpenseStore, getExcelExpenseStoreSnapshot);
  
  // Get data: Excel first, then program package
  const excelLtaData = getLtaSummaryFromExcel();
  const packageLtaData = getActiveLtaSummary();
  const baseLtaData = excelLtaData.length > 0 ? excelLtaData : packageLtaData;
  const dataSource = excelLtaData.length > 0 ? 'excel' : packageLtaData.length > 0 ? 'package' : 'none';
  
  // Get the rolling 12-month window date range
  const ltaDateRange = getLtaDateRange();
  const dateRangeText = ltaDateRange 
    ? `${new Date(ltaDateRange.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${new Date(ltaDateRange.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : '';

  const dateBounds = useMemo(() => {
    const allDates = baseLtaData.flatMap((r) => r.lodgingEntries.map((e) => e.date));
    const sorted = Array.from(new Set(allDates)).sort((a, b) => a.localeCompare(b));
    return {
      min: sorted[0] ?? '',
      max: sorted[sorted.length - 1] ?? '',
    };
  }, [baseLtaData]);

  useEffect(() => {
    setStartDate(dateBounds.min);
    setEndDate(dateBounds.max);
  }, [dateBounds.min, dateBounds.max]);

  const locationOptions = useMemo(() => {
    const uniqueLocations = Array.from(
      new Set(baseLtaData.flatMap((resource) => resource.lodgingEntries.map((entry) => entry.location)).filter(Boolean)),
    );

    return uniqueLocations
      .map(parseLocationOption)
      .sort((a, b) => a.state.localeCompare(b.state) || a.city.localeCompare(b.city));
  }, [baseLtaData]);

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

      if (!checked) {
        return current.filter((id) => visibleIds.includes(id));
      }

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

  const ltaData = useMemo(() => {
    const effectiveStart = startDate || dateBounds.min;
    const effectiveEnd = endDate || dateBounds.max;
    const monthKeys: string[] = [];

    if (effectiveStart && effectiveEnd) {
      const cursor = new Date(`${effectiveStart}T00:00:00`);
      cursor.setDate(1);
      const endCursor = new Date(`${effectiveEnd}T00:00:00`);
      endCursor.setDate(1);

      while (cursor <= endCursor) {
        monthKeys.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      }
    }

    return baseLtaData
      .map((resource) => {
        const filteredEntries = resource.lodgingEntries.filter((entry) => {
          if (effectiveStart && entry.date < effectiveStart) return false;
          if (effectiveEnd && entry.date > effectiveEnd) return false;
          const parsedLocation = parseLocationOption(entry.location);
          if (!selectedStates.includes(parsedLocation.state)) return false;
          if (!selectedCities.includes(parsedLocation.id)) return false;
          return true;
        });

        const monthMap = new Map<string, number>();
        for (const monthKey of monthKeys) monthMap.set(monthKey, 0);

        for (const entry of filteredEntries) {
          const entryDate = new Date(`${entry.date}T00:00:00`);
          const monthKey = `${entryDate.getUTCFullYear()}-${String(entryDate.getUTCMonth() + 1).padStart(2, '0')}`;
          monthMap.set(monthKey, (monthMap.get(monthKey) ?? 0) + 1);
        }

        const monthlyBreakdown = monthKeys.map((monthKey) => {
          const [year, month] = monthKey.split('-').map(Number);
          const monthDate = new Date(Date.UTC(year, (month ?? 1) - 1, 1));
          return {
            month: `${monthDate.toLocaleString('en-US', { month: 'short' })} ${year}`,
            nights: monthMap.get(monthKey) ?? 0,
          };
        });

        const totalNights = filteredEntries.length;
        const threshold = resource.threshold;
        const status = totalNights > threshold ? 'BREACH' : totalNights >= 100 ? 'WARNING' : 'OK';
        let trailingInactiveMonths = 0;

        for (let index = monthlyBreakdown.length - 1; index >= 0; index -= 1) {
          if (monthlyBreakdown[index].nights > 0) break;
          trailingInactiveMonths += 1;
        }

        const activityStatus = trailingInactiveMonths >= 2 ? 'inactive' : 'active';

        return {
          ...resource,
          lodgingEntries: filteredEntries,
          monthlyBreakdown,
          totalNights,
          status,
          activityStatus,
        };
      })
      .filter((resource) => resource.lodgingEntries.length > 0)
      .filter((resource) => {
        if (resourceActivityFilter === 'all') return true;
        return resource.activityStatus === resourceActivityFilter;
      });
  }, [baseLtaData, dataSource, startDate, endDate, dateBounds.min, dateBounds.max, selectedStates, selectedCities, resourceActivityFilter]);

  const breachCount = ltaData.filter((r) => r.status === 'BREACH').length;
  const warningCount = ltaData.filter((r) => r.status === 'WARNING').length;
  const okCount = ltaData.filter((r) => r.status === 'OK').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">LTA Tracking</h1>
        <p className="text-muted-foreground mt-1">
          Rolling 12-month lodging night compliance (120-night threshold)
          {dateRangeText && ` • ${dateRangeText}`}
        </p>
      </div>
      
      {dataSource === 'none' && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium">No LTA data available</p>
            <p className="text-xs text-muted-foreground mt-1">
              Upload an Excel expense file (Data Import page) or load a program package to view LTA tracking data.
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
        <KpiCard title="Compliant" value={okCount} icon={CheckCircle} trend="positive" />
        <KpiCard title="At Risk" value={warningCount} icon={AlertTriangle} trend={warningCount > 0 ? 'negative' : 'neutral'} />
        <KpiCard title="In Breach" value={breachCount} icon={Shield} trend={breachCount > 0 ? 'negative' : 'positive'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {ltaData.map((resource) => (
          <Card key={`${resource.resourceName}-${startDate}-${endDate}-${selectedStates.join(',')}-${selectedCities.join(',')}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {statusIcon[resource.status]}
                  <CardTitle className="text-lg">{resource.resourceName}</CardTitle>
                </div>
                <Badge variant={statusVariant[resource.status]}>{resource.status}</Badge>
              </div>
              <div className="mt-2">
                <div className="flex justify-between text-sm text-muted-foreground mb-1">
                  <span>{resource.totalNights} / {resource.threshold} nights</span>
                  <span>{Math.round((resource.totalNights / resource.threshold) * 100)}%</span>
                </div>
                <Progress
                  value={Math.min((resource.totalNights / resource.threshold) * 100, 100)}
                  className="h-2"
                />
              </div>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[220px] w-full aspect-auto">
                <LineChart data={resource.monthlyBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ReferenceLine y={10} stroke="hsl(var(--destructive))" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="nights" stroke="var(--color-nights)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>LTA Summary Table</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Resource</TableHead>
                <TableHead className="text-right">Total Nights</TableHead>
                <TableHead className="text-right">Threshold</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ltaData.map((r) => (
                <TableRow key={r.resourceName}>
                  <TableCell className="font-medium">{r.resourceName}</TableCell>
                  <TableCell className="text-right">{r.totalNights}</TableCell>
                  <TableCell className="text-right">{r.threshold}</TableCell>
                  <TableCell className={`text-right font-medium ${r.threshold - r.totalNights < 0 ? 'text-destructive' : 'text-success'}`}>
                    {r.threshold - r.totalNights}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={statusVariant[r.status]}>{r.status}</Badge>
                  </TableCell>
                </TableRow>
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
