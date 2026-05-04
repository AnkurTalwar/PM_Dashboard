// Expense compliance adapter - transforms Excel expense data into compliance format
// Checks expenses against policy limits

import type { ExcelExpenseRecord } from './excel-expense-store';
import { getExcelExpenseData, getUniqueEmployees } from './excel-expense-store';

export interface ExpenseComplianceSummary {
  employeeName: string;
  totalExpenses: number;
  violationCount: number;
  mealViolations: number;
  lodgingViolations: number;
  airfareViolations: number;
  weeklyViolations: number;
  expenseEntries: Array<{
    date: string;
    weekEnding: string;
    category: string;
    amount: number;
    location: string;
    project: string;
    vendor: string;
  }>;
  weeklyBreakdown: Array<{
    weekEnding: string;
    total: number;
    meals: number;
    lodging: number;
    airfare: number;
    ground: number;
    other: number;
    hasViolation: boolean;
  }>;
}

// Default policy limits (from expense-compliance.ts)
const DEFAULT_POLICY_LIMITS = {
  mealsPerDay: 79,
  lodgingPerNight: 262,
  airfarePerWeek: 2000,
  weeklyTotal: 1350
};

export interface CustomPolicyLimits {
  mealsPerDay: number;
  lodgingPerNight: number;
  airfarePerWeek: number;
  weeklyTotal: number;
}

// LocalStorage-based policy store
const POLICY_STORAGE_KEY = 'expense-policy-limits-v1';
let customLimits: CustomPolicyLimits | null = null;
const policyListeners = new Set<() => void>();

function loadCustomLimits(): CustomPolicyLimits | null {
  try {
    const raw = localStorage.getItem(POLICY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as any;
      // Migrate old weeklyNonAirfare to weeklyTotal
      if (parsed.weeklyNonAirfare !== undefined && parsed.weeklyTotal === undefined) {
        parsed.weeklyTotal = parsed.weeklyNonAirfare;
        delete parsed.weeklyNonAirfare;
      }
      // Add default airfarePerWeek if missing
      if (parsed.airfarePerWeek === undefined) {
        parsed.airfarePerWeek = DEFAULT_POLICY_LIMITS.airfarePerWeek;
      }
      if (parsed.mealsPerDay > 0 && parsed.lodgingPerNight > 0 && parsed.weeklyTotal > 0 && parsed.airfarePerWeek > 0) {
        saveCustomLimits(parsed);
        return parsed as CustomPolicyLimits;
      }
    }
  } catch {
    // Ignore
  }
  return null;
}

function saveCustomLimits(limits: CustomPolicyLimits | null) {
  try {
    if (limits) {
      localStorage.setItem(POLICY_STORAGE_KEY, JSON.stringify(limits));
    } else {
      localStorage.removeItem(POLICY_STORAGE_KEY);
    }
  } catch {
    // Ignore
  }
}

function emitPolicyChange() {
  for (const fn of policyListeners) fn();
}

export function setCustomPolicyLimits(limits: CustomPolicyLimits) {
  customLimits = limits;
  saveCustomLimits(limits);
  emitPolicyChange();
}

export function resetPolicyLimits() {
  customLimits = null;
  saveCustomLimits(null);
  emitPolicyChange();
}

export function getCustomPolicyLimits(): CustomPolicyLimits {
  if (!customLimits) {
    customLimits = loadCustomLimits();
  }
  return customLimits || DEFAULT_POLICY_LIMITS;
}

export function subscribePolicyLimits(callback: () => void): () => void {
  policyListeners.add(callback);
  return () => policyListeners.delete(callback);
}

// Map Excel expense types to our categories
const EXPENSE_TYPE_MAP: Record<string, string> = {
  'Out of Town Meals - self only': 'Meals',
  'OT Meals': 'Meals',
  'Business Meals': 'Meals',
  'Lodging': 'Lodging',
  'Lodging Tax': 'Lodging',
  'Airfare': 'Airfare',
  'Airline Fees': 'Airfare',
  'Ground Transport excl Mileage': 'Ground Transport',
  'Mileage': 'Ground Transport',
  'Parking': 'Ground Transport',
  'Car Rental': 'Ground Transport',
  'Car Rental - Fuel': 'Ground Transport',
  'Telephone (Non-Cell)': 'Other',
  'Cell Phone - Domestic': 'Other',
  'Inflight & Hotel WiFi Charges': 'Other',
  'Laundry': 'Other',
  'Miscellaneous': 'Other',
  'Tips/Gratuities': 'Other',
  'Entertainment - KPMG Personnel': 'Other',
  'Ent. Client / Prosp. Client': 'Other',
  'Recreational/Social': 'Other',
  'Per Diem': 'Other',
  'Journal Entry': 'Other',
  'Taxable Reimbursement': 'Other',
  'GrossUp Reimb Commute': 'Other'
};

function getCategory(expenseType: string): string {
  return EXPENSE_TYPE_MAP[expenseType] || 'Other';
}

function getWeekEnding(date: Date): string {
  // Find the Saturday following this date
  const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
  const daysUntilSaturday = (6 - dayOfWeek + 7) % 7;
  const saturday = new Date(date);
  saturday.setDate(date.getDate() + daysUntilSaturday);
  return saturday.toISOString().split('T')[0];
}

/**
 * Get expense compliance summary from Excel data
 */
export function getExpenseComplianceFromExcel(policyLimits?: CustomPolicyLimits): ExpenseComplianceSummary[] {
  const excelData = getExcelExpenseData();
  if (!excelData) return [];
  
  const limits = policyLimits || getCustomPolicyLimits();
  const employees = getUniqueEmployees();
  const summaries: ExpenseComplianceSummary[] = [];
  
  employees.forEach(employeeName => {
    const employeeExpenses = excelData.records.filter(r => r.employeeName === employeeName);
    
    if (employeeExpenses.length === 0) return;
    
    // Group by week
    const weeklyMap = new Map<string, ExcelExpenseRecord[]>();
    employeeExpenses.forEach(expense => {
      const weekEnding = getWeekEnding(expense.workDate);
      const existing = weeklyMap.get(weekEnding) || [];
      weeklyMap.set(weekEnding, [...existing, expense]);
    });
    
    // Calculate weekly breakdown
    const weeklyBreakdown = Array.from(weeklyMap.entries()).map(([weekEnding, expenses]) => {
      let meals = 0;
      let lodging = 0;
      let airfare = 0;
      let ground = 0;
      let other = 0;
      
      expenses.forEach(expense => {
        const category = getCategory(expense.expenseType);
        const amount = expense.expenses;
        
        switch (category) {
          case 'Meals':
            meals += amount;
            break;
          case 'Lodging':
            lodging += amount;
            break;
          case 'Airfare':
            airfare += amount;
            break;
          case 'Ground Transport':
            ground += amount;
            break;
          default:
            other += amount;
        }
      });
      
      const total = meals + lodging + airfare + ground + other;
      
      // Check violations (all four thresholds)
      const hasViolation = 
        meals / 7 > limits.mealsPerDay ||
        lodging > limits.lodgingPerNight ||
        airfare > limits.airfarePerWeek ||
        total > limits.weeklyTotal;
      
      return {
        weekEnding,
        total,
        meals,
        lodging,
        airfare,
        ground,
        other,
        hasViolation
      };
    }).sort((a, b) => a.weekEnding.localeCompare(b.weekEnding));
    
    // Count violations
    const mealViolations = weeklyBreakdown.filter(w => w.meals / 7 > limits.mealsPerDay).length;
    const lodgingViolations = weeklyBreakdown.filter(w => w.lodging > limits.lodgingPerNight).length;
    const airfareViolations = weeklyBreakdown.filter(w => w.airfare > limits.airfarePerWeek).length;
    const weeklyViolations = weeklyBreakdown.filter(w => w.total > limits.weeklyTotal).length;
    const violationCount = weeklyBreakdown.filter(w => w.hasViolation).length;
    
    // Expense entries
    const expenseEntries = employeeExpenses.map(expense => ({
      date: expense.workDate.toISOString().split('T')[0],
      weekEnding: getWeekEnding(expense.workDate),
      category: getCategory(expense.expenseType),
      amount: expense.expenses,
      location: expense.expenseLocation || 'Unknown',
      project: expense.engagementDescription || expense.engagement,
      vendor: expense.vendor || expense.additionalDetails || expense.expenseNarrative || 'Not specified'
    }));
    
    const totalExpenses = employeeExpenses.reduce((sum, e) => sum + e.expenses, 0);
    
    summaries.push({
      employeeName,
      totalExpenses,
      violationCount,
      mealViolations,
      lodgingViolations,
      airfareViolations,
      weeklyViolations,
      expenseEntries,
      weeklyBreakdown
    });
  });
  
  // Sort by violation count (descending)
  return summaries.sort((a, b) => b.violationCount - a.violationCount);
}

/**
 * Check if Excel expense compliance data is available
 */
export function hasExpenseComplianceData(): boolean {
  const excelData = getExcelExpenseData();
  return excelData !== null && excelData.records.length > 0;
}
