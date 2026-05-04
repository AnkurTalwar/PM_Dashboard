import type { ExpenseComplianceSummary } from '@/types/dashboard';

export type ExpenseCategory = ExpenseComplianceSummary['expenseEntries'][number]['category'];

export interface ExpenseComplianceRule {
  id: string;
  name: string;
  frequency: 'daily' | 'weekly' | 'transaction';
  limit: number;
  expenseTypes: ExpenseCategory[];
  excludeExpenseTypes?: ExpenseCategory[];
  detail?: string;
}

export interface ExpenseComplianceLimits {
  mealsPerDay: number;
  lodgingPerNight: number;
  weeklyNonAirfare: number; // Legacy property name, now represents total weekly including airfare
}

export interface ExpenseComplianceDetails {
  meals: string;
  lodging: string;
  weekly: string;
}

export interface ExpenseCompliancePolicy {
  rules: ExpenseComplianceRule[];
  // Legacy compatibility for pre-rule settings payloads.
  limits?: ExpenseComplianceLimits;
  details?: ExpenseComplianceDetails;
}

export const LEGACY_EXPENSE_RULE_IDS = {
  meals: 'meals-daily',
  lodging: 'lodging-daily',
  airfare: 'airfare-weekly',
  weekly: 'weekly-non-airfare',
} as const;

export const DEFAULT_EXPENSE_COMPLIANCE_POLICY: ExpenseCompliancePolicy = {
  rules: [
    {
      id: LEGACY_EXPENSE_RULE_IDS.meals,
      name: 'Meals Daily Limit',
      frequency: 'daily',
      limit: 79,
      expenseTypes: ['Meals'],
      detail: 'Maximum reimbursable meals per day',
    },
    {
      id: LEGACY_EXPENSE_RULE_IDS.lodging,
      name: 'Lodging Daily Limit',
      frequency: 'daily',
      limit: 262,
      expenseTypes: ['Lodging'],
      detail: 'Maximum reimbursable lodging per night',
    },
    {
      id: LEGACY_EXPENSE_RULE_IDS.weekly,
      name: 'Total Weekly Limit',
      frequency: 'weekly',
      limit: 1350,
      expenseTypes: ['Meals', 'Lodging', 'Airfare', 'Ground Transport', 'Other'],
      detail: 'Maximum weekly spend including all expenses',
    },
  ],
};

function toLegacyRuleSet(
  limits: ExpenseComplianceLimits | undefined,
  details: ExpenseComplianceDetails | undefined,
): ExpenseComplianceRule[] {
  const baseRules = DEFAULT_EXPENSE_COMPLIANCE_POLICY.rules;
  return [
    {
      ...baseRules[0],
      limit: limits?.mealsPerDay ?? baseRules[0].limit,
      detail: details?.meals ?? baseRules[0].detail,
    },
    {
      ...baseRules[1],
      limit: limits?.lodgingPerNight ?? baseRules[1].limit,
      detail: details?.lodging ?? baseRules[1].detail,
    },
    {
      ...baseRules[2],
      limit: limits?.weeklyNonAirfare ?? baseRules[2].limit,
      detail: details?.weekly ?? baseRules[2].detail,
    },
  ];
}

function isValidRule(rule: Partial<ExpenseComplianceRule> | undefined): rule is ExpenseComplianceRule {
  if (!rule) return false;
  if (!rule.id || !rule.name) return false;
  if (rule.frequency !== 'daily' && rule.frequency !== 'weekly' && rule.frequency !== 'transaction') return false;
  if (!Array.isArray(rule.expenseTypes) || rule.expenseTypes.length === 0) return false;
  if (typeof rule.limit !== 'number' || !Number.isFinite(rule.limit)) return false;
  return true;
}

export function normalizeExpenseCompliancePolicy(
  policy: Partial<ExpenseCompliancePolicy> | undefined,
): ExpenseCompliancePolicy {
  const normalizedRules = (policy?.rules ?? [])
    .filter(isValidRule)
    .map((rule) => ({
      id: rule.id,
      name: rule.name,
      frequency: rule.frequency,
      limit: rule.limit,
      expenseTypes: rule.expenseTypes,
      excludeExpenseTypes: rule.excludeExpenseTypes ?? [],
      detail: rule.detail,
    }));

  const rules = normalizedRules.length > 0
    ? normalizedRules
    : toLegacyRuleSet(policy?.limits, policy?.details);

  const legacyLimits: ExpenseComplianceLimits = {
    mealsPerDay:
      rules.find((rule) => rule.id === LEGACY_EXPENSE_RULE_IDS.meals)?.limit ??
      DEFAULT_EXPENSE_COMPLIANCE_POLICY.rules[0].limit,
    lodgingPerNight:
      rules.find((rule) => rule.id === LEGACY_EXPENSE_RULE_IDS.lodging)?.limit ??
      DEFAULT_EXPENSE_COMPLIANCE_POLICY.rules[1].limit,
    weeklyNonAirfare:
      rules.find((rule) => rule.id === LEGACY_EXPENSE_RULE_IDS.weekly)?.limit ??
      DEFAULT_EXPENSE_COMPLIANCE_POLICY.rules[2].limit,
  };

  const legacyDetails: ExpenseComplianceDetails = {
    meals:
      rules.find((rule) => rule.id === LEGACY_EXPENSE_RULE_IDS.meals)?.detail ??
      DEFAULT_EXPENSE_COMPLIANCE_POLICY.rules[0].detail ??
      '',
    lodging:
      rules.find((rule) => rule.id === LEGACY_EXPENSE_RULE_IDS.lodging)?.detail ??
      DEFAULT_EXPENSE_COMPLIANCE_POLICY.rules[1].detail ??
      '',
    weekly:
      rules.find((rule) => rule.id === LEGACY_EXPENSE_RULE_IDS.weekly)?.detail ??
      DEFAULT_EXPENSE_COMPLIANCE_POLICY.rules[2].detail ??
      '',
  };

  return {
    rules,
    limits: legacyLimits,
    details: legacyDetails,
  };
}

export function getExpenseViolationFlags(
  values: { meals: number; lodging: number; airfare: number; total: number },
  policy: ExpenseCompliancePolicy,
): { meal: boolean; lodging: boolean; weekly: boolean; any: boolean } {
  const normalizedPolicy = normalizeExpenseCompliancePolicy(policy);
  const mealRule = normalizedPolicy.rules.find((rule) => rule.id === LEGACY_EXPENSE_RULE_IDS.meals);
  const lodgingRule = normalizedPolicy.rules.find((rule) => rule.id === LEGACY_EXPENSE_RULE_IDS.lodging);
  const weeklyRule = normalizedPolicy.rules.find((rule) => rule.id === LEGACY_EXPENSE_RULE_IDS.weekly);

  const meal = mealRule ? values.meals > mealRule.limit : false;
  const lodging = lodgingRule ? values.lodging > lodgingRule.limit : false;
  const weekly = weeklyRule ? (values.total - values.airfare) > weeklyRule.limit : false;
  return {
    meal,
    lodging,
    weekly,
    any: meal || lodging || weekly,
  };
}

export function evaluateExpenseRules(
  entries: Array<Pick<ExpenseComplianceSummary['expenseEntries'][number], 'date' | 'weekEnding' | 'category' | 'amount' | 'location'>>,
  policy: ExpenseCompliancePolicy,
): {
  violationCount: number;
  violationsByRule: Record<string, number>;
  violationWeeks: Set<string>;
  weekRuleHits: Record<string, string[]>;
  transactionViolations: Array<{
    weekEnding: string;
    date: string;
    category: ExpenseCategory;
    amount: number;
    location: string;
    ruleId: string;
  }>;
} {
  const normalizedPolicy = normalizeExpenseCompliancePolicy(policy);
  const violationsByRule: Record<string, number> = {};
  const violationWeeks = new Set<string>();
  const weekRuleHits = new Map<string, Set<string>>();
  const transactionViolations: Array<{
    weekEnding: string;
    date: string;
    category: ExpenseCategory;
    amount: number;
    location: string;
    ruleId: string;
  }> = [];
  let violationCount = 0;

  const markWeekRuleHit = (weekEnding: string, ruleId: string) => {
    if (!weekRuleHits.has(weekEnding)) weekRuleHits.set(weekEnding, new Set());
    weekRuleHits.get(weekEnding)!.add(ruleId);
  };

  for (const rule of normalizedPolicy.rules) {
    const include = new Set(rule.expenseTypes);
    const exclude = new Set(rule.excludeExpenseTypes ?? []);

    if (rule.frequency === 'weekly') {
      const weeklySums = new Map<string, number>();
      for (const entry of entries) {
        if (!include.has(entry.category) || exclude.has(entry.category)) continue;
        weeklySums.set(entry.weekEnding, (weeklySums.get(entry.weekEnding) ?? 0) + entry.amount);
      }
      let ruleCount = 0;
      for (const [weekEnding, total] of weeklySums.entries()) {
        if (total > rule.limit) {
          ruleCount += 1;
          violationWeeks.add(weekEnding);
          markWeekRuleHit(weekEnding, rule.id);
        }
      }
      violationsByRule[rule.id] = ruleCount;
      violationCount += ruleCount;
      continue;
    }

    if (rule.frequency === 'transaction') {
      let ruleCount = 0;
      for (const entry of entries) {
        if (!include.has(entry.category) || exclude.has(entry.category)) continue;
        if (entry.amount > rule.limit) {
          ruleCount += 1;
          violationWeeks.add(entry.weekEnding);
          markWeekRuleHit(entry.weekEnding, rule.id);
          transactionViolations.push({
            weekEnding: entry.weekEnding,
            date: entry.date,
            category: entry.category,
            amount: entry.amount,
            location: entry.location,
            ruleId: rule.id,
          });
        }
      }
      violationsByRule[rule.id] = ruleCount;
      violationCount += ruleCount;
      continue;
    }

    const dailySums = new Map<string, { total: number; weekEnding: string }>();
    for (const entry of entries) {
      if (!include.has(entry.category) || exclude.has(entry.category)) continue;
      const current = dailySums.get(entry.date);
      if (!current) {
        dailySums.set(entry.date, { total: entry.amount, weekEnding: entry.weekEnding });
      } else {
        current.total += entry.amount;
      }
    }

    let ruleCount = 0;
    for (const bucket of dailySums.values()) {
      if (bucket.total > rule.limit) {
        ruleCount += 1;
        violationWeeks.add(bucket.weekEnding);
        markWeekRuleHit(bucket.weekEnding, rule.id);
      }
    }
    violationsByRule[rule.id] = ruleCount;
    violationCount += ruleCount;
  }

  return {
    violationCount,
    violationsByRule,
    violationWeeks,
    weekRuleHits: Object.fromEntries(
      Array.from(weekRuleHits.entries()).map(([weekEnding, ruleIds]) => [weekEnding, Array.from(ruleIds)]),
    ),
    transactionViolations,
  };
}
