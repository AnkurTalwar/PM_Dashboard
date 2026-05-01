export interface ForecastEntry {
  id: string;
  project: string;
  resourceName: string;
  level: string;
  weekEnding: string;
  forecastedHours: number;
  ptoProjection: number;
  isActive: boolean;
  isFlex: boolean;
}

export interface TimeEntry {
  id: string;
  employeeName: string;
  engagement: string;
  staffLevel: string;
  hours: number;
  weekEnding: string;
}

export interface ExpenseEntry {
  id: string;
  employeeName: string;
  workDate: string;
  weekEnding: string;
  expenseType: string;
  category: 'Meals' | 'Lodging' | 'Airfare' | 'Ground Transport' | 'Other';
  amount: number;
  description: string;
  vendor: string;
}

export interface ResourceSummary {
  project: string;
  resourceName: string;
  level: string;
  forecastedHours: number;
  billedHours: number;
  difference: number;
  ptoProjection: number;
  isFlex: boolean;
  hasBillingViolation: boolean;
  isActive: boolean;
  billingWithoutForecast: boolean;
}

export interface LtaSummary {
  resourceName: string;
  totalNights: number;
  threshold: number;
  status: 'OK' | 'WARNING' | 'BREACH';
  monthlyBreakdown: { month: string; nights: number }[];
  lodgingEntries: { date: string; amount: number; location: string; project: string | null }[];
}

export interface ExpenseComplianceSummary {
  employeeName: string;
  totalExpenses: number;
  violationCount: number;
  mealViolations: number;
  lodgingViolations: number;
  weeklyViolations: number;
  expenseEntries: {
    date: string;
    weekEnding: string;
    category: 'Meals' | 'Lodging' | 'Airfare' | 'Ground Transport' | 'Other';
    amount: number;
    location: string;
    project: string | null;
  }[];
  weeklyBreakdown: {
    weekEnding: string;
    total: number;
    meals: number;
    lodging: number;
    airfare: number;
    ground: number;
    other: number;
    hasViolation: boolean;
  }[];
}

export interface DataImport {
  id: string;
  fileName: string;
  uploadDate: string;
  recordCount: number;
  status: 'processing' | 'completed' | 'error';
  type: 'forecast' | 'time_expense';
}
