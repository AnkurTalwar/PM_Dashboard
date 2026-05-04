// LTA data adapter - transforms Excel expense data into LTA format
// Uses lodging expenses from Excel to calculate hotel nights

import type { ExcelExpenseRecord } from './excel-expense-store';
import { getLodgingExpenses, getExcelExpenseData } from './excel-expense-store';

export interface LtaSummary {
  resourceName: string;
  totalNights: number;
  threshold: number;
  status: '✅ OK' | '⚠️ WARNING' | '🚨 BREACH';
  monthlyBreakdown: Array<{ month: string; nights: number }>;
  lodgingEntries: Array<{
    date: string;
    amount: number;
    location: string;
    project: string;
  }>;
}

const LTA_THRESHOLD = 120;
const WARNING_THRESHOLD = 100;

/**
 * Get LTA summary from Excel expense data with rolling 12-month window
 * Groups lodging expenses by employee and calculates nights
 * Automatically filters to last 12 months as of the end of the last completed month
 */
export function getLtaSummaryFromExcel(): LtaSummary[] {
  const excelData = getExcelExpenseData();
  if (!excelData) return [];
  
  const lodgingExpenses = getLodgingExpenses();
  
  // Find the latest expense date to determine the rolling 12-month window
  let latestDate: Date | null = null;
  lodgingExpenses.forEach(expense => {
    if (!latestDate || expense.workDate > latestDate) {
      latestDate = expense.workDate;
    }
  });
  
  // Calculate rolling 12-month window: end of the PREVIOUS completed month
  let windowEnd: Date;
  let windowStart: Date;
  
  if (latestDate) {
    // End of the PREVIOUS month (last completed month)
    // If latest date is 4/22/2026, we end at 3/31/2026
    windowEnd = new Date(latestDate.getFullYear(), latestDate.getMonth(), 0);
    windowEnd.setHours(23, 59, 59, 999);
    
    // 12 months back: end of the month 12 months before
    // If windowEnd is 3/31/2026, windowStart is 3/31/2025
    // Data will include April 2025 through March 2026
    windowStart = new Date(windowEnd.getFullYear() - 1, windowEnd.getMonth() + 1, 0);
    windowStart.setHours(0, 0, 0, 0);
  } else {
    // Fallback if no data
    windowEnd = new Date();
    windowStart = new Date(windowEnd.getFullYear() - 1, windowEnd.getMonth() + 1, 0);
  }
  
  // Group by employee
  const byEmployee = new Map<string, ExcelExpenseRecord[]>();
  lodgingExpenses.forEach(expense => {
    // Filter to rolling 12-month window (exclude windowStart, include from next day onwards)
    // windowStart is last day of previous month, so we want dates > windowStart
    if (expense.workDate > windowStart && expense.workDate <= windowEnd) {
      const existing = byEmployee.get(expense.employeeName) || [];
      byEmployee.set(expense.employeeName, [...existing, expense]);
    }
  });
  
  // Generate all 12 months in the window for consistent display
  // windowStart is the last day of a month, so we start from the NEXT month
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const allMonthKeys: string[] = [];
  const allMonthLabels: string[] = [];
  
  // Start from the month AFTER windowStart (e.g., if windowStart is Mar 31, start from April)
  const firstMonthDate = new Date(windowStart.getFullYear(), windowStart.getMonth() + 1, 1);
  
  for (let i = 0; i < 12; i++) {
    const monthDate = new Date(firstMonthDate.getFullYear(), firstMonthDate.getMonth() + i, 1);
    const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = `${monthNames[monthDate.getMonth()]} ${monthDate.getFullYear()}`;
    allMonthKeys.push(monthKey);
    allMonthLabels.push(monthLabel);
  }
  
  // Transform to LTA summary format
  const summaries: LtaSummary[] = [];
  
  byEmployee.forEach((expenses, employeeName) => {
    // Calculate total nights (one expense record = one night)
    // Filter lodging entries with exclusions:
    // 1. Only "Lodging" type (not "Lodging Tax")
    // 2. Amount >= $60 (exclude lodging tax miscategorized as lodging)
    // 3. Virginia/DC area only
    // 4. Exclude refunds (negative amounts and their matching positive amounts)
    
    const isVirginiaOrDC = (location: string): boolean => {
      const loc = location.toLowerCase();
      return loc.includes('virginia') || loc.includes('va') || 
             loc.includes('washington') || loc.includes('dc') || 
             loc.includes('district of columbia');
    };
    
    // First pass: filter base criteria
    const baseLodging = expenses.filter(e => 
      e.expenseType === 'Lodging' && 
      e.expenses >= 60 &&
      isVirginiaOrDC(e.expenseLocation || '')
    );
    
    // Second pass: identify and exclude refunds
    const refunds = baseLodging.filter(e => e.expenses < 0);
    const refundAmounts = new Set(refunds.map(e => Math.abs(e.expenses)));
    
    // Track which positive amounts we've matched to refunds
    const matchedPositiveIndices = new Set<number>();
    
    baseLodging.forEach((entry, index) => {
      if (entry.expenses > 0 && refundAmounts.has(entry.expenses)) {
        // Check if we haven't already matched this amount
        const matchingRefund = refunds.find(r => Math.abs(r.expenses) === entry.expenses);
        if (matchingRefund && !matchedPositiveIndices.has(index)) {
          matchedPositiveIndices.add(index);
        }
      }
    });
    
    // Final filtered list: exclude negative amounts and their matched positives
    const lodgingOnly = baseLodging.filter((e, index) => 
      e.expenses > 0 && !matchedPositiveIndices.has(index)
    );
    
    const totalNights = lodgingOnly.length;
    
    // Determine status
    let status: '✅ OK' | '⚠️ WARNING' | '🚨 BREACH';
    if (totalNights > LTA_THRESHOLD) {
      status = '🚨 BREACH';
    } else if (totalNights >= WARNING_THRESHOLD) {
      status = '⚠️ WARNING';
    } else {
      status = '✅ OK';
    }
    
    // Monthly breakdown - ensure all 12 months are included
    const monthlyMap = new Map<string, number>();
    allMonthKeys.forEach(key => monthlyMap.set(key, 0));
    
    lodgingOnly.forEach(expense => {
      const date = expense.workDate;
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + 1);
    });
    
    // Convert to array with proper month labels
    const monthlyBreakdown = allMonthKeys.map((monthKey, index) => ({
      month: allMonthLabels[index],
      nights: monthlyMap.get(monthKey) || 0
    }));
    
    // Lodging entries with all details
    const lodgingEntries = lodgingOnly.map(expense => ({
      date: expense.workDate.toISOString().split('T')[0],
      amount: expense.expenses,
      location: expense.expenseLocation || 'Unknown',
      project: expense.engagementDescription || expense.engagement
    })).sort((a, b) => a.date.localeCompare(b.date));
    
    summaries.push({
      resourceName: employeeName,
      totalNights,
      threshold: LTA_THRESHOLD,
      status,
      monthlyBreakdown,
      lodgingEntries
    });
  });
  
  // Sort by total nights (descending)
  return summaries.sort((a, b) => b.totalNights - a.totalNights);
}

/**
 * Get the rolling 12-month window date range for LTA tracking
 * Returns the start and end dates based on the latest expense data
 */
export function getLtaDateRange(): { start: string; end: string } | null {
  const lodgingExpenses = getLodgingExpenses();
  
  if (lodgingExpenses.length === 0) {
    return null;
  }
  
  // Find the latest expense date
  let latestDate: Date | null = null;
  lodgingExpenses.forEach(expense => {
    if (!latestDate || expense.workDate > latestDate) {
      latestDate = expense.workDate;
    }
  });
  
  if (!latestDate) {
    return null;
  }
  
  // End of the PREVIOUS month (last completed month)
  // If latest date is 4/22/2026, we end at 3/31/2026
  const windowEnd = new Date(latestDate.getFullYear(), latestDate.getMonth(), 0);
  windowEnd.setHours(23, 59, 59, 999);
  
  // 12 months back: end of the month 12 months before
  // If windowEnd is 3/31/2026, windowStart is 3/31/2025
  // Data will include April 2025 through March 2026
  const windowStart = new Date(windowEnd.getFullYear() - 1, windowEnd.getMonth() + 1, 0);
  windowStart.setHours(0, 0, 0, 0);
  
  return {
    start: windowStart.toISOString().split('T')[0],
    end: windowEnd.toISOString().split('T')[0]
  };
}

/**
 * Check if Excel LTA data is available
 */
export function hasLtaData(): boolean {
  const lodgingExpenses = getLodgingExpenses();
  return lodgingExpenses.length > 0;
}
