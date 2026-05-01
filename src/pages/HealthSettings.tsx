import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RotateCcw, Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { DEFAULT_THRESHOLDS, loadThresholds, saveThresholds, type HealthThresholds } from '@/lib/health-thresholds';

interface FieldDef {
  key: keyof HealthThresholds;
  label: string;
  help: string;
  unit?: string;
}

const sections: { title: string; description: string; fields: [FieldDef, FieldDef] }[] = [
  {
    title: 'Hours Reconciliation',
    description: 'Absolute variance between billed and forecasted hours per project.',
    fields: [
      { key: 'hoursVarianceWarn', label: 'Yellow at ≥', help: 'Variance hours that triggers Watch.', unit: 'hrs' },
      { key: 'hoursVarianceBreach', label: 'Red at ≥', help: 'Variance hours that triggers At Risk.', unit: 'hrs' },
    ],
  },
  {
    title: 'LTA Tracking',
    description: 'Number of project resources at WARNING or BREACH on the 120-night rolling threshold.',
    fields: [
      { key: 'ltaAtRiskWarn', label: 'Yellow at ≥', help: 'Resources at risk that triggers Watch.', unit: 'people' },
      { key: 'ltaAtRiskBreach', label: 'Red at ≥', help: 'Resources at risk that triggers At Risk.', unit: 'people' },
    ],
  },
  {
    title: 'Expense Compliance',
    description: 'Total per-diem + weekly violations on the project.',
    fields: [
      { key: 'expenseViolationsWarn', label: 'Yellow at ≥', help: 'Violations that triggers Watch.', unit: 'violations' },
      { key: 'expenseViolationsBreach', label: 'Red at ≥', help: 'Violations that triggers At Risk.', unit: 'violations' },
    ],
  },
  {
    title: 'ETC — Projected Cushion',
    description:
      'Projected cushion (USD) at end of engagement. Negative = favorable (under budget), positive = unfavorable (over budget).',
    fields: [
      { key: 'cushionWarn', label: 'Yellow when ≥', help: 'Cushion at/above this triggers Watch (approaching break-even).', unit: 'USD' },
      { key: 'cushionBreach', label: 'Red when ≥', help: 'Cushion at/above this triggers At Risk (over budget).', unit: 'USD' },
    ],
  },
];

export default function HealthSettings() {
  const { toast } = useToast();
  const [values, setValues] = useState<HealthThresholds>(() => loadThresholds());

  const setField = (key: keyof HealthThresholds, raw: string) => {
    const n = Number(raw);
    setValues((prev) => ({ ...prev, [key]: Number.isFinite(n) ? n : 0 }));
  };

  const handleSave = () => {
    saveThresholds(values);
    toast({ title: 'Thresholds saved', description: 'Health scorecard will reflect the new cutoffs.' });
  };

  const handleReset = () => {
    setValues(DEFAULT_THRESHOLDS);
    saveThresholds(DEFAULT_THRESHOLDS);
    toast({ title: 'Defaults restored' });
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
            <Link to="/"><ArrowLeft className="h-4 w-4 mr-1" /> Back to Project Health</Link>
          </Button>
          <h1 className="text-3xl font-bold">Health Thresholds</h1>
          <p className="text-muted-foreground mt-1">
            Configure red/yellow cutoffs used by the Project Health scorecard. Stored locally in your browser.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-2" /> Reset
          </Button>
          <Button onClick={handleSave}>
            <Save className="h-4 w-4 mr-2" /> Save
          </Button>
        </div>
      </div>

      <Separator />

      {sections.map((section) => (
        <Card key={section.title}>
          <CardHeader>
            <CardTitle>{section.title}</CardTitle>
            <CardDescription>{section.description}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {section.fields.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={f.key}>
                  {f.label} {f.unit && <span className="text-muted-foreground font-normal">({f.unit})</span>}
                </Label>
                <Input
                  id={f.key}
                  type="number"
                  value={values[f.key]}
                  onChange={(e) => setField(f.key, e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{f.help}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
