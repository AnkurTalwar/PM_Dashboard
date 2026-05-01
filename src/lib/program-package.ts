import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import {
  FY_CONFIG,
  engagementCodes,
  etcForecastRows,
  etcProjects,
  etcResources,
  etcWeekEndings,
  type EngagementCode,
  type EtcForecastRow,
  type EtcProject,
  type EtcResource,
} from '@/lib/etc-data';
import {
  parseForecastCalendarFile,
  pushForecastCalendarSnapshot,
  type ForecastCalendarSnapshot,
} from '@/lib/forecast-calendar';
import {
  parsePtoCalendarFile,
  pushPtoCalendarSnapshot,
  type PtoCalendarSnapshot,
} from '@/lib/pto-calendar';
import { clearWipStore, setWipSnapshots } from '@/lib/wip-store';
import { parseWipFile } from '@/lib/wip-parser';
import type { ExpenseComplianceSummary, LtaSummary } from '@/types/dashboard';
import {
  DEFAULT_EXPENSE_COMPLIANCE_POLICY,
  evaluateExpenseRules,
  LEGACY_EXPENSE_RULE_IDS,
  normalizeExpenseCompliancePolicy,
  type ExpenseCompliancePolicy,
} from '@/lib/expense-compliance';

export interface ProgramManifest {
  schemaVersion: '1.0';
  programId: string;
  programName: string;
  files: {
    settings: string;
    forecast?: string;
    pto?: string;
    projects?: string;
    timeAndExpense?: string;
    workbook?: string;
    resources?: string;
    engagementCodes?: string;
    snapshotsDir?: string;
  };
}

export interface ExpenseForecastRow {
  project: string;
  remainingNonRecoverableExpenses: number;
}

export interface ProgramSettings {
  fyConfig: {
    rateEscalation: number;
    adminFee: number;
    marginGoalPerDirector: number;
  };
  expenseCompliance?: ExpenseCompliancePolicy;
  expenseForecasts?: ExpenseForecastRow[];
}

export interface LoadedProgramPackage {
  manifest: ProgramManifest;
  settings: ProgramSettings;
  resources: EtcResource[];
  projects: EtcProject[];
  engagementCodes: EngagementCode[];
  forecastRows: EtcForecastRow[];
  ptoRows: number;
  timeRows: number;
  expenseRows: number;
  expenseCompliance: ExpenseComplianceSummary[];
  ltaSummary: LtaSummary[];
  weekEndings: string[];
  ptoWeekEndings: string[];
  expenseForecasts: ExpenseForecastRow[];
  snapshotFiles: string[];
  loadedAt: string;
}

export interface ProgramFileSpec {
  key: keyof ProgramManifest['files'];
  format: 'json' | 'xlsx';
  required: boolean;
  templateName: string;
  description: string;
  requiredHeaders?: string[];
}

export const PROGRAM_MANIFEST_TEMPLATE: ProgramManifest = {
  schemaVersion: '1.0',
  programId: 'fame-2026',
  programName: 'FAME 2026',
  files: {
    settings: 'settings.json',
    forecast: 'forecast-data.xlsx',
    pto: 'pto-data.xlsx',
    projects: 'projects-data.xlsx',
    snapshotsDir: 'snapshots',
  },
};

export const PROGRAM_SETTINGS_TEMPLATE: ProgramSettings = {
  fyConfig: {
    rateEscalation: 0.05,
    adminFee: 0.12,
    marginGoalPerDirector: 870000,
  },
  expenseCompliance: DEFAULT_EXPENSE_COMPLIANCE_POLICY,
  expenseForecasts: [
    { project: 'F3-2026', remainingNonRecoverableExpenses: 543242 },
    { project: 'F3-2025', remainingNonRecoverableExpenses: 0 },
  ],
};

export const WORKBOOK_SHEET_NAMES = {
  FORECAST: 'Forecast',
  PTO: 'PTO',
  RESOURCES: 'Resources',
  PROJECTS: 'Projects',
  CODES: 'Codes',
  TIME: 'TIME',
  EXPENSE: 'EXPENSE',
} as const;

export const PROGRAM_PACKAGE_FILE_SPECS: ProgramFileSpec[] = [
  {
    key: 'settings',
    format: 'json',
    required: true,
    templateName: 'settings.json',
    description: 'Program-wide FY config, rate escalation, admin fee, margin goal, and per-project expense forecasts.',
  },
  {
    key: 'forecast',
    format: 'xlsx',
    required: true,
    templateName: 'forecast-data.xlsx',
    description:
      'Forecast rows (resource × project) with weekly date columns. ' +
      'Can also include denormalized columns like level, rates, sync code, and workstream.',
  },
  {
    key: 'pto',
    format: 'xlsx',
    required: false,
    templateName: 'pto-data.xlsx',
    description:
      'Optional PTO tracker by project/resource/week. Uses same weekly date columns as forecast. ' +
      'PTO hours are deducted from forecast hours to derive net remaining engagement forecast.',
  },
  {
    key: 'projects',
    format: 'xlsx',
    required: true,
    templateName: 'projects-data.xlsx',
    description: 'Project-level metadata and SOW values (Project, Type, Status, Original SOW, Total Fees, MSB Fee, optional Expense Cash Paid).',
  },
  {
    key: 'workbook',
    format: 'xlsx',
    required: false,
    templateName: 'program-data.xlsx',
    description: 'Optional compatibility mode: single workbook with Forecast / Resources / Projects / Codes sheets.',
  },
  {
    key: 'snapshotsDir',
    format: 'xlsx',
    required: false,
    templateName: 'snapshots/',
    description: 'Optional folder of WIP xlsx snapshots loaded oldest to newest to seed current/prior WIP automatically.',
  },
];

interface ProgramPackageStoreState {
  current: LoadedProgramPackage | null;
}

const STORAGE_KEY = 'etc-program-package-v1';

let state: ProgramPackageStoreState = loadFromStorage();
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota/storage errors
  }
}

function loadFromStorage(): ProgramPackageStoreState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ProgramPackageStoreState;
  } catch {
    // corrupted storage; start fresh
  }
  return { current: null };
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

  function formatRowError(fileName: string, rowNumber: number, field: string, detail: string): string {
    return `${fileName} row ${rowNumber}, ${field}: ${detail}`;
  }

function num(value: unknown): number {
  if (value == null || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function str(value: unknown): string {
  return String(value ?? '').trim();
}

function readSheetRows(buffer: ArrayBuffer): Record<string, unknown>[] {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Workbook has no sheets');
  const worksheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: null,
    raw: true,
  });
}

function readWorkbookSheetRows(wb: XLSX.WorkBook, sheetName: string): Record<string, unknown>[] {
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    throw new Error(
      `Sheet "${sheetName}" not found. Expected sheets: ${Object.values(WORKBOOK_SHEET_NAMES).join(', ')}`,
    );
  }
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: true });
}

function findKey(row: Record<string, unknown>, wanted: string): string | null {
  const normalizedWanted = normalizeHeader(wanted);
  for (const key of Object.keys(row)) {
    if (normalizeHeader(key) === normalizedWanted) return key;
  }
  return null;
}

function requireHeaders(rows: Record<string, unknown>[], headers: string[], label: string) {
  const sample = rows[0] ?? {};
  const missing = headers.filter((header) => !findKey(sample, header));
  if (missing.length > 0) {
    throw new Error(`${label} is missing required columns: ${missing.join(', ')}`);
  }
}

function validateUniqueValues(values: string[], label: string, fileName: string) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (!normalized) continue;
    if (seen.has(normalized)) duplicates.add(value);
    seen.add(normalized);
  }
  if (duplicates.size > 0) {
    throw new Error(`${fileName} has duplicate ${label} values: ${Array.from(duplicates).slice(0, 10).join(', ')}`);
  }
}

function parseResources(rows: Record<string, unknown>[]): EtcResource[] {
  requireHeaders(rows, ['Resource', 'Level', 'Rate FY26', 'Labor Cost FY26', 'Rate FY27', 'Labor Cost FY27'], `${WORKBOOK_SHEET_NAMES.RESOURCES} sheet`);
  const errors: string[] = [];
  const parsed = rows
    .map((row, index) => {
      const rowNumber = index + 2;
      const name = str(row[findKey(row, 'Resource') ?? '']);
      const level = str(row[findKey(row, 'Level') ?? '']);
      const rate2026 = num(row[findKey(row, 'Rate FY26') ?? '']);
      const laborCost2026 = num(row[findKey(row, 'Labor Cost FY26') ?? '']);
      const rate2027 = num(row[findKey(row, 'Rate FY27') ?? '']);
      const laborCost2027 = num(row[findKey(row, 'Labor Cost FY27') ?? '']);

      if (!name) errors.push(formatRowError(`${WORKBOOK_SHEET_NAMES.RESOURCES} sheet`, rowNumber, 'Resource', 'value is required'));
      if (!level) errors.push(formatRowError(`${WORKBOOK_SHEET_NAMES.RESOURCES} sheet`, rowNumber, 'Level', 'value is required'));
      if (rate2026 < 0) errors.push(formatRowError(`${WORKBOOK_SHEET_NAMES.RESOURCES} sheet`, rowNumber, 'Rate FY26', 'must be >= 0'));
      if (laborCost2026 < 0) errors.push(formatRowError(`${WORKBOOK_SHEET_NAMES.RESOURCES} sheet`, rowNumber, 'Labor Cost FY26', 'must be >= 0'));
      if (rate2027 < 0) errors.push(formatRowError(`${WORKBOOK_SHEET_NAMES.RESOURCES} sheet`, rowNumber, 'Rate FY27', 'must be >= 0'));
      if (laborCost2027 < 0) errors.push(formatRowError(`${WORKBOOK_SHEET_NAMES.RESOURCES} sheet`, rowNumber, 'Labor Cost FY27', 'must be >= 0'));

      return {
        name,
        level,
        rate2026,
        laborCost2026,
        rate2027,
        laborCost2027,
      };
    })
    .filter((row) => row.name.length > 0);

  if (errors.length > 0) throw new Error(errors.slice(0, 10).join('; '));
  validateUniqueValues(parsed.map((row) => row.name), 'resource', WORKBOOK_SHEET_NAMES.RESOURCES);
  return parsed;
}

function parseProjects(rows: Record<string, unknown>[]): EtcProject[] {
  requireHeaders(rows, ['Project', 'Type', 'Status', 'Original SOW', 'Total Fees', 'MSB Fee'], `${WORKBOOK_SHEET_NAMES.PROJECTS} sheet`);
  const errors: string[] = [];
  const parsed = rows
    .map((row, index) => {
      const rowNumber = index + 2;
      const name = str(row[findKey(row, 'Project') ?? '']);
      const originalSOW = num(row[findKey(row, 'Original SOW') ?? '']);

      if (!name) errors.push(formatRowError(`${WORKBOOK_SHEET_NAMES.PROJECTS} sheet`, rowNumber, 'Project', 'value is required'));
      if (originalSOW < 0) errors.push(formatRowError(`${WORKBOOK_SHEET_NAMES.PROJECTS} sheet`, rowNumber, 'Original SOW', 'must be >= 0'));

      return {
        name,
        type: str(row[findKey(row, 'Type') ?? '']) || null,
        status: str(row[findKey(row, 'Status') ?? '']) || null,
        erpPlusAdmin: findKey(row, 'ERP + Admin')
          ? (num(row[findKey(row, 'ERP + Admin') ?? '']) || null)
          : null,
        originalSOW: originalSOW || null,
        totalFees: num(row[findKey(row, 'Total Fees') ?? '']) || null,
        msbFee: num(row[findKey(row, 'MSB Fee') ?? '']) || null,
        expenseCashPaid: findKey(row, 'Expense Cash Paid') ? (num(row[findKey(row, 'Expense Cash Paid') ?? '']) || null) : null,
      };
    })
    .filter((row) => row.name.length > 0);

  if (errors.length > 0) throw new Error(errors.slice(0, 10).join('; '));
  validateUniqueValues(parsed.map((row) => row.name), 'project', WORKBOOK_SHEET_NAMES.PROJECTS);
  return parsed;
}

function parseEngagementCodes(rows: Record<string, unknown>[]): EngagementCode[] {
  requireHeaders(rows, ['Engagement Code', 'Parent Code', 'Description'], `${WORKBOOK_SHEET_NAMES.CODES} sheet`);
  const errors: string[] = [];
  const parsed = rows
    .map((row, index) => {
      const rowNumber = index + 2;
      const code = str(row[findKey(row, 'Engagement Code') ?? '']);
      if (!code) errors.push(formatRowError(`${WORKBOOK_SHEET_NAMES.CODES} sheet`, rowNumber, 'Engagement Code', 'value is required'));
      return {
        code,
        parent: num(row[findKey(row, 'Parent Code') ?? '']) || null,
        description: str(row[findKey(row, 'Description') ?? '']) || null,
      };
    })
    .filter((row) => row.code.length > 0);

  if (errors.length > 0) throw new Error(errors.slice(0, 10).join('; '));
  validateUniqueValues(parsed.map((row) => row.code), 'engagement code', WORKBOOK_SHEET_NAMES.CODES);
  return parsed;
}

function forecastSnapshotToLookupRows(snapshot: ForecastCalendarSnapshot): EtcForecastRow[] {
  return snapshot.rows.map((row) => ({
    workstream: row.workstream ?? null,
    project: row.project,
    resource: row.resource,
    level: row.level ?? null,
    syncCode: row.syncCode ?? null,
    sowHours: row.sowHours ?? null,
    totalForecastHours: row.weeklyHours.reduce((sum, value) => sum + value, 0) + row.estPtoHours,
    weekly: row.weeklyHours,
  }));
}

interface TimeAndExpenseInsights {
  timeRows: number;
  expenseRows: number;
  expenseCompliance: ExpenseComplianceSummary[];
  ltaSummary: LtaSummary[];
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
  }
  if (typeof value === 'string' && value.trim()) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function weekEndingFromDate(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const delta = (5 - d.getDay() + 7) % 7; // Friday
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function toIsoDate(value: unknown): string | null {
  const d = toDate(value);
  return d ? d.toISOString().slice(0, 10) : null;
}

function normalizeExpenseCategory(expenseType: string): 'Meals' | 'Lodging' | 'Airfare' | 'Ground Transport' | 'Other' {
  const t = expenseType.trim().toLowerCase();
  if (t.includes('meal')) return 'Meals';
  if (t.includes('lodg') || t.includes('hotel')) return 'Lodging';
  if (t.includes('air')) return 'Airfare';
  if (t.includes('ground') || t.includes('taxi') || t.includes('uber') || t.includes('lyft') || t.includes('rail') || t.includes('train') || t.includes('car')) {
    return 'Ground Transport';
  }
  return 'Other';
}

function normalizeProjectKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function resolveProjectFromExpenseRow(row: Record<string, unknown>, knownProjects: string[]): string | null {
  const candidateHeaders = [
    'Project',
    'Project Name',
    'Engagement',
    'Engagement Name',
    'Engagement Code',
    'Engagement Number',
    'Charge Code',
  ];

  const candidates = candidateHeaders
    .map((header) => str(row[findKey(row, header) ?? '']))
    .filter((value) => value.length > 0);

  if (candidates.length === 0 || knownProjects.length === 0) return null;

  const normalizedProjects = knownProjects.map((name) => ({ name, key: normalizeProjectKey(name) }));
  for (const candidate of candidates) {
    const key = normalizeProjectKey(candidate);
    const exact = normalizedProjects.find((project) => project.key === key);
    if (exact) return exact.name;

    const contains = normalizedProjects.find(
      (project) => key.includes(project.key) || project.key.includes(key),
    );
    if (contains) return contains.name;
  }

  return null;
}

function parseTimeAndExpenseWorkbook(
  buffer: ArrayBuffer,
  fileName: string,
  knownProjects: string[] = [],
  expensePolicy: ExpenseCompliancePolicy = DEFAULT_EXPENSE_COMPLIANCE_POLICY,
  timeSheetName = WORKBOOK_SHEET_NAMES.TIME,
  expenseSheetName = WORKBOOK_SHEET_NAMES.EXPENSE,
): TimeAndExpenseInsights {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const timeSheet = wb.Sheets[timeSheetName];
  const expenseSheet = wb.Sheets[expenseSheetName];
  if (!timeSheet || !expenseSheet) {
    throw new Error(`${fileName} must include ${timeSheetName} and ${expenseSheetName} sheets`);
  }

  const timeRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(timeSheet, { defval: null, raw: true });
  const expenseRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(expenseSheet, { defval: null, raw: true });
  requireHeaders(expenseRows, ['Employee Name', 'Expense Type', 'Expenses'], `${expenseSheetName} sheet`);

  const expenseByEmployeeWeek = new Map<string, {
    employeeName: string;
    weekly: Map<string, { meals: number; lodging: number; airfare: number; ground: number; other: number }>;
    expenseEntries: { date: string; weekEnding: string; category: 'Meals' | 'Lodging' | 'Airfare' | 'Ground Transport' | 'Other'; amount: number; location: string; project: string | null }[];
  }>();
  const lodgingDailyNet = new Map<string, { employeeName: string; date: string; netAmount: number; locationCounts: Map<string, number>; projectCounts: Map<string, number> }>();
  let maxLodgingDate: Date | null = null;

  for (const row of expenseRows) {
    const employeeName = str(row[findKey(row, 'Employee Name') ?? '']) || 'Unknown Employee';
    const expenseType = str(row[findKey(row, 'Expense Type') ?? '']);
    const amount = num(row[findKey(row, 'Expenses') ?? '']);
    const workDateRaw =
      row[findKey(row, 'Work Date') ?? ''] ??
      row[findKey(row, 'Expense Entry Date') ?? ''] ??
      row[findKey(row, 'Posting Date') ?? ''];
    const workDate = toDate(workDateRaw);
    const weekEnding = workDate ? weekEndingFromDate(workDate) : 'Unknown';
    const category = normalizeExpenseCategory(expenseType);
    const project = resolveProjectFromExpenseRow(row, knownProjects);

    if (!expenseByEmployeeWeek.has(employeeName)) {
      expenseByEmployeeWeek.set(employeeName, { employeeName, weekly: new Map(), expenseEntries: [] });
    }
    const employeeBucket = expenseByEmployeeWeek.get(employeeName)!;
    if (!employeeBucket.weekly.has(weekEnding)) {
      employeeBucket.weekly.set(weekEnding, { meals: 0, lodging: 0, airfare: 0, ground: 0, other: 0 });
    }
    const weekBucket = employeeBucket.weekly.get(weekEnding)!;
    if (category === 'Meals') weekBucket.meals += amount;
    else if (category === 'Lodging') weekBucket.lodging += amount;
    else if (category === 'Airfare') weekBucket.airfare += amount;
    else if (category === 'Ground Transport') weekBucket.ground += amount;
    else weekBucket.other += amount;

    employeeBucket.expenseEntries.push({
      date: toIsoDate(workDateRaw) || weekEnding,
      weekEnding,
      category,
      amount,
      location: str(row[findKey(row, 'Expense Location') ?? '']) || 'Unknown',
      project,
    });

    if (category === 'Lodging') {
      const dateIso = toIsoDate(workDateRaw);
      if (dateIso) {
        const dailyKey = `${employeeName}::${dateIso}`;
        if (!lodgingDailyNet.has(dailyKey)) {
          lodgingDailyNet.set(dailyKey, {
            employeeName,
            date: dateIso,
            netAmount: 0,
            locationCounts: new Map(),
            projectCounts: new Map(),
          });
        }

        const bucket = lodgingDailyNet.get(dailyKey)!;
        bucket.netAmount += amount;
        const location = str(row[findKey(row, 'Expense Location') ?? '']) || 'Unknown';
        bucket.locationCounts.set(location, (bucket.locationCounts.get(location) ?? 0) + 1);
        if (project) {
          bucket.projectCounts.set(project, (bucket.projectCounts.get(project) ?? 0) + 1);
        }

        const d = new Date(`${dateIso}T00:00:00`);
        if (!maxLodgingDate || d > maxLodgingDate) maxLodgingDate = d;
      }
    }
  }

  const lodgingByEmployee = new Map<string, { entries: { date: string; amount: number; location: string; project: string | null }[] }>();
  for (const day of lodgingDailyNet.values()) {
    // Count one lodging night per employee/date only when the net postings for that day are positive.
    if (day.netAmount <= 0) continue;
    const topLocation = Array.from(day.locationCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Unknown';
    const topProject = Array.from(day.projectCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    if (!lodgingByEmployee.has(day.employeeName)) {
      lodgingByEmployee.set(day.employeeName, { entries: [] });
    }
    lodgingByEmployee.get(day.employeeName)!.entries.push({
      date: day.date,
      amount: day.netAmount,
      location: topLocation,
      project: topProject,
    });
  }

  const expenseCompliance: ExpenseComplianceSummary[] = Array.from(expenseByEmployeeWeek.values())
    .map(({ employeeName, weekly, expenseEntries }) => {
      const sortedEntries = expenseEntries.sort((a, b) => a.date.localeCompare(b.date));
      const ruleResults = evaluateExpenseRules(sortedEntries, expensePolicy);
      const weeklyBreakdown = Array.from(weekly.entries())
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

      return {
        employeeName,
        totalExpenses: weeklyBreakdown.reduce((sum, row) => sum + row.total, 0),
        violationCount: ruleResults.violationCount,
        mealViolations: ruleResults.violationsByRule[LEGACY_EXPENSE_RULE_IDS.meals] ?? 0,
        lodgingViolations: ruleResults.violationsByRule[LEGACY_EXPENSE_RULE_IDS.lodging] ?? 0,
        weeklyViolations: ruleResults.violationsByRule[LEGACY_EXPENSE_RULE_IDS.weekly] ?? 0,
        expenseEntries: sortedEntries,
        weeklyBreakdown,
      };
    })
    .sort((a, b) => b.totalExpenses - a.totalExpenses);

  const ltaAnchor = maxLodgingDate ?? new Date();
  const monthStarts: Date[] = [];
  for (let i = 11; i >= 0; i--) {
    monthStarts.push(new Date(Date.UTC(ltaAnchor.getUTCFullYear(), ltaAnchor.getUTCMonth() - i, 1)));
  }
  const monthLabels = monthStarts.map((d) => d.toLocaleString('en-US', { month: 'short' }));
  const windowStart = monthStarts[0];
  const windowEnd = new Date(Date.UTC(ltaAnchor.getUTCFullYear(), ltaAnchor.getUTCMonth() + 1, 1));

  const ltaSummary: LtaSummary[] = Array.from(lodgingByEmployee.entries())
    .map(([resourceName, payload]) => {
      const monthlyCounts = new Map<string, number>();
      for (const month of monthLabels) monthlyCounts.set(month, 0);

      const entriesInWindow = payload.entries.filter((entry) => {
        const d = new Date(`${entry.date}T00:00:00`);
        return d >= windowStart && d < windowEnd;
      });

      for (const entry of entriesInWindow) {
        const d = new Date(`${entry.date}T00:00:00`);
        const month = d.toLocaleString('en-US', { month: 'short' });
        monthlyCounts.set(month, (monthlyCounts.get(month) ?? 0) + 1);
      }

      const monthlyBreakdown = monthLabels.map((month) => ({ month, nights: monthlyCounts.get(month) ?? 0 }));
      const totalNights = monthlyBreakdown.reduce((sum, m) => sum + m.nights, 0);
      const threshold = 120;
      const status: LtaSummary['status'] = totalNights > threshold ? 'BREACH' : totalNights > 90 ? 'WARNING' : 'OK';

      return {
        resourceName,
        totalNights,
        threshold,
        status,
        monthlyBreakdown,
        lodgingEntries: entriesInWindow,
      };
    })
    .sort((a, b) => b.totalNights - a.totalNights);

  return {
    timeRows: timeRows.length,
    expenseRows: expenseRows.length,
    expenseCompliance,
    ltaSummary,
  };
}

function deriveProjectsFromForecast(snapshot: ForecastCalendarSnapshot): EtcProject[] {
  const map = new Map<string, EtcProject>();
  for (const row of snapshot.rows) {
    if (!row.project) continue;
    if (!map.has(row.project)) {
      map.set(row.project, {
        name: row.project,
        type: null,
        status: null,
        erpPlusAdmin: row.erpPlusAdmin ?? null,
        originalSOW: null,
        totalFees: null,
        msbFee: null,
        expenseCashPaid: null,
      });
    }
  }
  return Array.from(map.values());
}

function deriveResourcesFromForecast(snapshot: ForecastCalendarSnapshot): EtcResource[] {
  const map = new Map<string, EtcResource>();
  for (const row of snapshot.rows) {
    if (!row.resource) continue;
    if (!map.has(row.resource)) {
      map.set(row.resource, {
        name: row.resource,
        level: row.level || 'ASSOCIATE',
        rate2026: row.stdRate || 0,
        laborCost2026: row.laborCost || 0,
        rate2027: row.stdRateNextFy ?? row.stdRate ?? 0,
        laborCost2027: row.laborCostNextFy ?? row.laborCost ?? 0,
      });
    }
  }
  return Array.from(map.values());
}

function deriveCodesFromForecast(snapshot: ForecastCalendarSnapshot): EngagementCode[] {
  const map = new Map<string, EngagementCode>();
  for (const row of snapshot.rows) {
    const code = String(row.syncCode ?? '').trim();
    if (!code) continue;
    if (!map.has(code)) {
      map.set(code, {
        code,
        parent: row.parentCode ?? null,
        description: row.codeDescription ?? null,
      });
    }
  }
  return Array.from(map.values());
}

async function readJsonFile<T>(dir: FileSystemDirectoryHandle, name: string): Promise<T> {
  const handle = await dir.getFileHandle(name);
  const file = await handle.getFile();
  return JSON.parse(await file.text()) as T;
}

async function readBufferFile(dir: FileSystemDirectoryHandle, name: string): Promise<ArrayBuffer> {
  const handle = await dir.getFileHandle(name);
  const file = await handle.getFile();
  return file.arrayBuffer();
}

async function tryReadBufferFile(dir: FileSystemDirectoryHandle, name: string | undefined): Promise<ArrayBuffer | null> {
  if (!name) return null;
  try {
    return await readBufferFile(dir, name);
  } catch {
    return null;
  }
}

async function tryGetDirectoryHandle(dir: FileSystemDirectoryHandle, name: string): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await dir.getDirectoryHandle(name);
  } catch {
    return null;
  }
}

function validateManifest(manifest: ProgramManifest) {
  if (manifest.schemaVersion !== '1.0') {
    throw new Error(`Unsupported manifest schema version: ${manifest.schemaVersion}`);
  }
}

function toSheet<T extends Record<string, unknown>>(rows: T[], headers: string[]): XLSX.WorkSheet {
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  XLSX.utils.sheet_add_aoa(worksheet, [headers], { origin: 'A1' });
  return worksheet;
}

function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function buildWorkbookBuffer(sheetName: string, rows: Record<string, unknown>[], headers: string[]): Uint8Array {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, toSheet(rows, headers), sheetName);
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as Uint8Array;
}

export async function downloadProgramPackageTemplateBundle(): Promise<void> {
  const zip = new JSZip();
  const templateRoot = zip.folder('program-package-template');
  if (!templateRoot) {
    throw new Error('Failed to create template bundle');
  }

  templateRoot.file('manifest.json', JSON.stringify(PROGRAM_MANIFEST_TEMPLATE, null, 2));
  templateRoot.file('settings.json', JSON.stringify(PROGRAM_SETTINGS_TEMPLATE, null, 2));

  const weekEndings = getActiveWeekEndings();
  const forecastHeaders = ['Project', 'Resource', 'Level', 'Std Rate', 'Labor Cost', 'Sync Code', 'Workstream', 'SOW Hours', 'ERP + Admin', ...weekEndings, 'Est PTO'];
  const forecastRows = getActiveForecastRows().slice(0, 100).map((row) => {
    const output: Record<string, unknown> = {
      Project: row.project,
      Resource: row.resource,
      Level: row.level,
      'Std Rate': null,
      'Labor Cost': null,
      'Sync Code': row.syncCode,
      Workstream: row.workstream,
      'SOW Hours': row.sowHours,
      'ERP + Admin': null,
      'Est PTO': 0,
    };
    weekEndings.forEach((week, index) => {
      output[week] = row.weekly[index] ?? 0;
    });
    return output;
  });
  templateRoot.file(
    PROGRAM_MANIFEST_TEMPLATE.files.forecast || 'forecast-data.xlsx',
    buildWorkbookBuffer(WORKBOOK_SHEET_NAMES.FORECAST, forecastRows, forecastHeaders),
  );

  const ptoHeaders = ['Project', 'Resource', ...weekEndings];
  const ptoRows = getActiveForecastRows().slice(0, 100).map((row) => {
    const output: Record<string, unknown> = {
      Project: row.project,
      Resource: row.resource,
    };
    weekEndings.forEach((week) => {
      output[week] = 0;
    });
    return output;
  });
  templateRoot.file(
    PROGRAM_MANIFEST_TEMPLATE.files.pto || 'pto-data.xlsx',
    buildWorkbookBuffer(WORKBOOK_SHEET_NAMES.PTO, ptoRows, ptoHeaders),
  );

  const projectRows = getActiveProjects().map((row) => ({
    Project: row.name,
    Type: row.type,
    Status: row.status,
    'ERP + Admin': row.erpPlusAdmin,
    'Original SOW': row.originalSOW,
    'Total Fees': row.totalFees,
    'MSB Fee': row.msbFee,
    'Expense Cash Paid': row.expenseCashPaid,
  }));
  templateRoot.file(
    PROGRAM_MANIFEST_TEMPLATE.files.projects || 'projects-data.xlsx',
    buildWorkbookBuffer(
      WORKBOOK_SHEET_NAMES.PROJECTS,
      projectRows,
      ['Project', 'Type', 'Status', 'ERP + Admin', 'Original SOW', 'Total Fees', 'MSB Fee', 'Expense Cash Paid'],
    ),
  );

  const snapshotsFolder = templateRoot.folder('snapshots');
  snapshotsFolder?.file('README.txt', 'Place weekly WIP .xlsx snapshots here. Files are loaded oldest to newest to seed prior/current WIP.');

  const bundle = await zip.generateAsync({ type: 'blob' });
  downloadBlob('program-package-template.zip', bundle);
}

export async function loadProgramPackageFromDirectory(dir: FileSystemDirectoryHandle): Promise<LoadedProgramPackage> {
  const manifest = await readJsonFile<ProgramManifest>(dir, 'manifest.json');
  validateManifest(manifest);

  const rawSettings = await readJsonFile<ProgramSettings>(dir, manifest.files.settings);
  const settings: ProgramSettings = {
    ...rawSettings,
    expenseCompliance: normalizeExpenseCompliancePolicy(rawSettings.expenseCompliance),
  };
  const workbookBuffer = await tryReadBufferFile(dir, manifest.files.workbook);

  let forecastSnapshot: ForecastCalendarSnapshot;
  let ptoSnapshot: PtoCalendarSnapshot | null = null;
  let projects: EtcProject[] = [];
  let resources: EtcResource[] = [];
  let codes: EngagementCode[] = [];
  let timeAndExpense: TimeAndExpenseInsights = {
    timeRows: 0,
    expenseRows: 0,
    expenseCompliance: [],
    ltaSummary: [],
  };

  if (workbookBuffer) {
    const wb = XLSX.read(workbookBuffer, { type: 'array', cellDates: true });
    forecastSnapshot = parseForecastCalendarFile(workbookBuffer, manifest.files.workbook || 'program-data.xlsx', WORKBOOK_SHEET_NAMES.FORECAST);
    if (wb.Sheets[WORKBOOK_SHEET_NAMES.PTO]) {
      ptoSnapshot = parsePtoCalendarFile(workbookBuffer, manifest.files.workbook || 'program-data.xlsx', WORKBOOK_SHEET_NAMES.PTO);
    }

    const projectSheet = wb.Sheets[WORKBOOK_SHEET_NAMES.PROJECTS];
    projects = projectSheet
      ? parseProjects(XLSX.utils.sheet_to_json<Record<string, unknown>>(projectSheet, { defval: null, raw: true }))
      : deriveProjectsFromForecast(forecastSnapshot);

    const resourceSheet = wb.Sheets[WORKBOOK_SHEET_NAMES.RESOURCES];
    resources = resourceSheet
      ? parseResources(XLSX.utils.sheet_to_json<Record<string, unknown>>(resourceSheet, { defval: null, raw: true }))
      : deriveResourcesFromForecast(forecastSnapshot);

    const codesSheet = wb.Sheets[WORKBOOK_SHEET_NAMES.CODES];
    codes = codesSheet
      ? parseEngagementCodes(XLSX.utils.sheet_to_json<Record<string, unknown>>(codesSheet, { defval: null, raw: true }))
      : deriveCodesFromForecast(forecastSnapshot);

    if (wb.Sheets[WORKBOOK_SHEET_NAMES.TIME] && wb.Sheets[WORKBOOK_SHEET_NAMES.EXPENSE]) {
      timeAndExpense = parseTimeAndExpenseWorkbook(
        workbookBuffer,
        manifest.files.workbook || 'program-data.xlsx',
        projects.map((project) => project.name),
        settings.expenseCompliance,
        WORKBOOK_SHEET_NAMES.TIME,
        WORKBOOK_SHEET_NAMES.EXPENSE,
      );
    }
  } else {
    const forecastFile = manifest.files.forecast;
    const projectsFile = manifest.files.projects;
    if (!forecastFile) {
      throw new Error('manifest.files.forecast is required when workbook is not provided');
    }
    const forecastBuffer = await readBufferFile(dir, forecastFile);
    forecastSnapshot = parseForecastCalendarFile(forecastBuffer, forecastFile);

    if (manifest.files.pto) {
      const ptoBuffer = await readBufferFile(dir, manifest.files.pto);
      ptoSnapshot = parsePtoCalendarFile(ptoBuffer, manifest.files.pto);
    }

    if (projectsFile) {
      projects = parseProjects(readSheetRows(await readBufferFile(dir, projectsFile)));
    } else {
      projects = deriveProjectsFromForecast(forecastSnapshot);
    }

    if (manifest.files.resources) {
      resources = parseResources(readSheetRows(await readBufferFile(dir, manifest.files.resources)));
    } else {
      resources = deriveResourcesFromForecast(forecastSnapshot);
    }

    if (manifest.files.engagementCodes) {
      codes = parseEngagementCodes(readSheetRows(await readBufferFile(dir, manifest.files.engagementCodes)));
    } else {
      codes = deriveCodesFromForecast(forecastSnapshot);
    }
  }

  pushForecastCalendarSnapshot(forecastSnapshot);
  if (ptoSnapshot) {
    pushPtoCalendarSnapshot(ptoSnapshot);
  }

  const expenseForecasts: ExpenseForecastRow[] = settings.expenseForecasts ?? [];

  let snapshotFiles: string[] = [];
  clearWipStore();
  if (manifest.files.snapshotsDir) {
    const snapshotsDir = await tryGetDirectoryHandle(dir, manifest.files.snapshotsDir);
    if (snapshotsDir) {
      const snapshots = [];
      for await (const handle of snapshotsDir.values()) {
        if (handle.kind !== 'file' || !handle.name.match(/\.xlsx?$/i)) continue;
        const file = await (handle as FileSystemFileHandle).getFile();
        const snapshot = parseWipFile(await file.arrayBuffer(), handle.name);
        snapshots.push(snapshot);
      }
      snapshots.sort((a, b) => (a.weekEnding || a.uploadedAt).localeCompare(b.weekEnding || b.uploadedAt));
      if (snapshots.length > 0) {
        setWipSnapshots(snapshots);
        snapshotFiles = snapshots.map((snapshot) => snapshot.fileName);
      }
    }
  }

  const loaded: LoadedProgramPackage = {
    manifest,
    settings,
    resources,
    projects,
    engagementCodes: codes,
    forecastRows: forecastSnapshotToLookupRows(forecastSnapshot),
    ptoRows: ptoSnapshot?.rows.length ?? 0,
    timeRows: timeAndExpense.timeRows,
    expenseRows: timeAndExpense.expenseRows,
    expenseCompliance: timeAndExpense.expenseCompliance,
    ltaSummary: timeAndExpense.ltaSummary,
    weekEndings: forecastSnapshot.weekEndings,
    ptoWeekEndings: ptoSnapshot?.weekEndings ?? [],
    expenseForecasts,
    snapshotFiles,
    loadedAt: new Date().toISOString(),
  };

  state = { current: loaded };
  persist();
  emit();
  return loaded;
}

export function clearProgramPackageStore(): void {
  state = { current: null };
  persist();
  emit();
}

export function subscribeProgramPackageStore(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function getProgramPackageStoreSnapshot(): ProgramPackageStoreState {
  return state;
}

export function getCurrentProgramPackage(): LoadedProgramPackage | null {
  return state.current;
}

export function supportsProgramFolderPicker(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export function getActiveResources(): EtcResource[] {
  return state.current?.resources ?? etcResources;
}

export function getActiveProjects(): EtcProject[] {
  return state.current?.projects ?? etcProjects;
}

export function getActiveEngagementCodes(): EngagementCode[] {
  return state.current?.engagementCodes ?? engagementCodes;
}

export function getActiveForecastRows(): EtcForecastRow[] {
  return state.current?.forecastRows ?? etcForecastRows;
}

export function getActiveWeekEndings(): string[] {
  return state.current?.weekEndings ?? etcWeekEndings;
}

export function getActiveFyConfig(): typeof FY_CONFIG {
  return state.current?.settings.fyConfig ?? FY_CONFIG;
}

export function getActiveExpenseCompliancePolicy(): ExpenseCompliancePolicy {
  return normalizeExpenseCompliancePolicy(state.current?.settings.expenseCompliance);
}

export function getActiveExpenseForecastByProject(project: string): number | null {
  const found = state.current?.expenseForecasts.find((row) => row.project === project);
  return found ? found.remainingNonRecoverableExpenses : null;
}

export function getActiveExpenseComplianceSummary(): ExpenseComplianceSummary[] {
  return state.current?.expenseCompliance ?? [];
}

export function getActiveLtaSummary(): LtaSummary[] {
  return state.current?.ltaSummary ?? [];
}